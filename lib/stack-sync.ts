import type { GuestRecord, LocalStackProduct } from './local-stack'
import type { StackItem } from './nutrient-limits'
import type { AdditionOutbox, PendingAddition } from './stack-addition-outbox'

export type SavedStackItem = Omit<StackItem, 'products' | 'servings_per_day'> & { servings_per_day: number | string | null; product_id: string; products: StackItem['products'] | null }
export type StackSnapshot = { userId: string; stackId: string | null; revision: number; items: SavedStackItem[]; recoveryConflicts: number }
export type StackSyncState = { identity: string | null | undefined; snapshot: StackSnapshot | null; guest: GuestRecord[]; loading: boolean; busy: boolean; error: string | null; retryable: boolean }
// Existing direct writes may contain NULL, NaN, fractions or out-of-range doses.
// Preserve those records but exclude them from analysis until reviewed.
export function validStackServings(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10
}
export function analysisServings(snapshot: StackSnapshot | null, productId: string): number | null {
  const saved = snapshot?.items.find(item => item.product_id === productId)
  return saved ? (validStackServings(saved.servings_per_day) ? saved.servings_per_day : null) : 1
}
type GuestStore = { read(): GuestRecord[]; add(product: LocalStackProduct): void; acknowledge(records: GuestRecord[]): void; remove(id: string): void; clear(): void }
type Pending = { method: string; body: object; requestId: string; guest?: GuestRecord[]; addition?: PendingAddition; identity: string; epoch: number }
const unavailable = 'Your stack change could not be confirmed. Retry this change before leaving the page.'
const additionUnavailable = 'Your addition could not be confirmed. It is kept in this browser for this account and will retry when you reconnect. You can also retry now.'
const storageUnavailable = 'Pending account additions could not be stored or read on this device. No new addition was sent. Restore browser storage and retry.'

// A single provider owns this service. It serialises this tab's writes; the DB
// enforces owner scope, idempotency and revision checks across all other clients.
export function createStackSync(deps: { guest: GuestStore; additions: AdditionOutbox; request: typeof fetch; nonce(): string; changed(state: StackSyncState): void }) {
  let state: StackSyncState = { identity: undefined, snapshot: null, guest: [], loading: true, busy: false, error: null, retryable: false }
  let epoch = 0, queue = Promise.resolve(), pending: Pending | null = null, disposed = false
  const active = (generation: number) => !disposed && epoch === generation
  function publish(patch: Partial<StackSyncState> = {}) {
    if (disposed) return
    state = { ...state, ...patch }
    deps.changed(state)
  }
  function readGuest() {
    try { publish({ guest: deps.guest.read() }) }
    catch { publish({ error: 'Browser storage is unavailable. Changes cannot be saved on this device.' }) }
  }
  function enqueue(work: () => Promise<void>) {
    queue = queue.then(work).catch(() => publish({ error: unavailable, retryable: true, busy: false, loading: false }))
    return queue
  }
  function snapshot(value: unknown, identity: string): StackSnapshot {
    const s = value as StackSnapshot
    if (!s || s.userId !== identity || !Number.isSafeInteger(s.revision) || s.revision < 0 || !Array.isArray(s.items) || !s.items.every(i => i && typeof i.product_id === 'string')) throw new Error('Invalid stack response')
    return s
  }
  async function send(operation: Pending) {
    if (!active(operation.epoch) || state.identity !== operation.identity) return
    if (pending && pending !== operation) { publish({ error: 'Retry the unconfirmed change before making another change.' }); return }
    if (operation.addition) {
      try {
        const stored = deps.additions.read(operation.identity).find(record => record.requestId === operation.requestId)
        if (!stored) { pending = null; return } // Another tab acknowledged it.
        if (stored.productId !== operation.addition.productId) throw new Error('Pending request changed')
      } catch { publish({ error: storageUnavailable, retryable: true }); return }
    }
    publish({ busy: true, error: null })
    try {
      const response = await deps.request('/api/stack', { method: operation.method, headers: { 'Content-Type': 'application/json', 'Idempotency-Key': operation.requestId, 'X-Stack-Expected-User': operation.identity }, body: JSON.stringify(operation.body), cache: 'no-store', signal: AbortSignal.timeout(15000) })
      const data = await response.json()
      if (!active(operation.epoch) || state.identity !== operation.identity) return
      if (response.status === 409 && data.snapshot && !operation.addition) {
        publish({ snapshot: snapshot(data.snapshot, operation.identity), error: 'Your stack changed on another device. Review the latest stack before making that change again.', retryable: false })
        pending = null
        return
      }
      if (!response.ok || data.status !== 'applied') throw new Error('Unconfirmed save')
      const saved = snapshot(data.snapshot, operation.identity)
      if (operation.addition) {
        const id = operation.addition.productId
        if (!Array.isArray(data.acceptedIds) || !Array.isArray(data.rejectedIds)
          || data.acceptedIds.length + data.rejectedIds.length !== 1
          || [...data.acceptedIds, ...data.rejectedIds].some(value => value !== id)
          || (data.acceptedIds.length && data.duplicate !== true && !saved.items.some(item => item.product_id === id))) throw new Error('Missing addition acknowledgement')
        // A duplicate receipt may accompany a newer snapshot in which another
        // device removed the product. Confirm the receipt without re-adding it.
        deps.additions.acknowledge(operation.addition)
      }
      if (operation.guest) {
        if (!Array.isArray(data.acceptedIds) || data.acceptedIds.some((id: unknown) => typeof id !== 'string' || !saved.items.some(item => item.product_id === id))) throw new Error('Missing acknowledgement')
        const accepted = new Set(data.acceptedIds)
        deps.guest.acknowledge(operation.guest.filter(r => accepted.has(r.product.id)))
      }
      pending = null
      publish({ snapshot: saved, error: Array.isArray(data.rejectedIds) && data.rejectedIds.length ? (operation.guest ? 'Some products are unavailable. They remain in your browser stack for review.' : 'This product is unavailable and has not been added.') : null, retryable: false })
      readGuest()
    } catch {
      if (active(operation.epoch)) {
        pending = operation // Retry the exact nonce and payload, including an uncertain removal.
        publish({ error: operation.addition ? additionUnavailable : operation.guest ? 'Your stack could not be saved. Your browser items are kept. Retry when the connection is available.' : unavailable, retryable: true })
      }
    } finally { if (active(operation.epoch)) publish({ busy: false, loading: false }) }
  }
  async function resumeAdditions(generation: number): Promise<boolean> {
    const identity = state.identity
    if (!identity || !active(generation) || (pending && !pending.addition)) return false
    let records: PendingAddition[]
    try { records = deps.additions.read(identity) }
    catch { publish({ error: storageUnavailable, retryable: true }); return false }
    // Another tab may have acknowledged the in-memory retry while we were away.
    if (pending?.addition && !records.some(record => record.requestId === pending!.requestId)) {
      pending = null
      publish({ error: null, retryable: false })
    }
    if (pending?.addition) records.sort((a, b) => a.requestId === pending!.requestId ? -1 : b.requestId === pending!.requestId ? 1 : 0)
    // A per-write cap is advisory across tabs. Drain a bounded batch even if
    // simultaneous tab writes briefly exceeded it; never strand those records.
    for (const addition of records.slice(0, 100)) {
      if (!active(generation) || state.identity !== identity) return false
      const operation: Pending = { method: 'POST', body: { productId: addition.productId }, requestId: addition.requestId, addition, identity, epoch: generation }
      pending = operation
      await send(operation)
      if (pending || !active(generation)) return false
    }
    if (records.length > 100) {
      publish({ error: 'More account additions remain in this browser. Retry to continue saving them.', retryable: true })
      return false
    }
    return true
  }
  async function refresh(generation: number, merge: boolean) {
    const identity = state.identity
    if (!identity || !active(generation)) return
    publish({ loading: !state.snapshot })
    try {
      const response = await deps.request('/api/stack', { cache: 'no-store', signal: AbortSignal.timeout(15000) })
      const data = await response.json()
      if (!active(generation)) return
      if (!response.ok) throw new Error('Read failed')
      publish({ snapshot: snapshot(data, identity), loading: false, error: pending ? state.error : null })
      readGuest()
      if (!await resumeAdditions(generation)) return
      if (merge && !pending && state.guest.length) await send({ method: 'POST', body: { productIds: state.guest.slice(0, 100).map(r => r.product.id) }, requestId: deps.nonce(), guest: state.guest.slice(0, 100), identity, epoch: generation })
    } catch { if (active(generation)) publish({ loading: false, error: 'Your saved stack could not be loaded. Your browser items are kept. Retry to reconnect.', retryable: true }) }
  }
  function write(method: string, body: object) {
    if (!state.identity || !state.snapshot || state.busy || pending) {
      publish({ error: pending ? 'Retry the unconfirmed change before making another change.' : 'Wait for your saved stack to load before changing it.' })
      return Promise.resolve()
    }
    // A destructive write must not overtake another tab's durable addition.
    // Refresh/retry drains additions using their original receipts first.
    try {
      if (deps.additions.read(state.identity).length) {
        publish({ error: 'Retry pending additions for this account before making another change.', retryable: true })
        return Promise.resolve()
      }
    } catch { publish({ error: storageUnavailable, retryable: true }); return Promise.resolve() }
    const operation = { method, body, requestId: deps.nonce(), identity: state.identity, epoch }
    return enqueue(() => send(operation))
  }
  const api = {
    getState: () => state,
    setIdentity(identity: string | null) {
      if (disposed) return Promise.resolve()
      if (state.identity === identity) return Promise.resolve()
      epoch++; pending = null
      publish({ identity, snapshot: null, loading: Boolean(identity), busy: false, error: null, retryable: false })
      readGuest()
      const generation = epoch
      return enqueue(() => refresh(generation, true))
    },
    authFailed() { publish({ loading: false, error: 'Sign-in status could not be checked. Reconnect or reload before changing your stack.' }) },
    refresh() { const generation = epoch; readGuest(); return enqueue(() => refresh(generation, false)) },
    retry() { const generation = epoch; return enqueue(() => pending && !pending.addition ? send(pending) : refresh(generation, true)) },
    add(p: LocalStackProduct) {
      if (state.identity === undefined) { api.authFailed(); return Promise.resolve() }
      if (state.identity === null) {
        try { deps.guest.add(p); readGuest(); publish({ error: null }) } catch (error) { publish({ error: error instanceof Error ? error.message : unavailable }) }
        return Promise.resolve()
      }
      if (!state.snapshot || state.busy || pending) {
        publish({ error: pending ? 'Retry the unconfirmed change before making another change.' : 'Wait for your saved stack to load before changing it.' })
        return Promise.resolve()
      }
      let addition: PendingAddition
      try {
        if (deps.additions.read(state.identity).length) {
          publish({ error: 'Retry pending additions for this account before making another change.', retryable: true })
          return Promise.resolve()
        }
        addition = deps.additions.add(state.identity, p.id, deps.nonce())
      }
      catch { publish({ error: storageUnavailable, retryable: true }); return Promise.resolve() }
      const operation: Pending = { method: 'POST', body: { productId: addition.productId }, requestId: addition.requestId, addition, identity: state.identity, epoch }
      pending = operation // Block this tab synchronously, before the queued fetch.
      return enqueue(() => send(operation))
    },
    remove(id: string) {
      if (state.identity === undefined) return Promise.resolve()
      if (state.busy || pending) { publish({ error: 'Wait for or retry the unconfirmed change before removing another item.' }); return Promise.resolve() }
      if (state.identity === null || !state.snapshot?.items.some(i => i.product_id === id)) {
        try { deps.guest.remove(id); readGuest() } catch { publish({ error: 'This browser item could not be removed. Please retry.' }) }
        return Promise.resolve()
      }
      return write('DELETE', { productId: id, expectedRevision: state.snapshot.revision })
    },
    clear() {
      if (state.identity === undefined) return Promise.resolve()
      if (state.busy || pending) { publish({ error: 'Wait for or retry the unconfirmed change before clearing your stack.' }); return Promise.resolve() }
      if (state.identity === null) {
        try { deps.guest.clear(); readGuest() } catch { publish({ error: 'Browser items could not be cleared. Please retry.' }) }
        return Promise.resolve()
      }
      // A saved-stack clear never discards unconfirmed guest items.
      return write('DELETE', { clear: true, expectedRevision: state.snapshot?.revision })
    },
    servings(id: string, value: number) { return write('PATCH', { productId: id, servingsPerDay: value, expectedRevision: state.snapshot?.revision }) },
    dispose() { disposed = true; epoch++ },
  }
  return api
}
