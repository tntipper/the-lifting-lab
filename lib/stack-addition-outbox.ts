import type { StackStorage } from './local-stack'

// One immutable key per account/request prevents unrelated tab additions from
// overwriting each other. No tokens, email addresses, scores or labels are stored.
export const ADDITION_OUTBOX_PREFIX = 'tll_stack_v3_add:'
export type PendingAddition = { version: 1; ownerId: string; requestId: string; productId: string }
export type AdditionOutbox = ReturnType<typeof createAdditionOutbox>
type Storage = StackStorage & { removeItem(key: string): void }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value) }
function prefix(ownerId: string) {
  if (!uuid(ownerId)) throw new Error('Invalid outbox account')
  return ADDITION_OUTBOX_PREFIX + ownerId.toLowerCase() + ':'
}
const keyFor = (record: PendingAddition) => prefix(record.ownerId) + record.requestId
function parse(raw: string, key: string, ownerId: string): PendingAddition {
  const value = JSON.parse(raw) as PendingAddition
  if (!value || value.version !== 1 || !uuid(value.ownerId) || !uuid(value.requestId) || !uuid(value.productId)
    || value.ownerId !== ownerId || keyFor(value) !== key
    || Object.keys(value).length !== 4) throw new Error('Unrecognised pending addition')
  return value
}

export function createAdditionOutbox(storage: Storage) {
  function read(owner: string): PendingAddition[] {
    const ownerId = owner.toLowerCase(), start = prefix(ownerId), keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(start)) keys.push(key)
    }
    return keys.sort().flatMap(key => {
      const raw = storage.getItem(key)
      return raw === null ? [] : [parse(raw, key, ownerId)]
    })
  }
  return {
    read,
    add(owner: string, product: string, request: string): PendingAddition {
      if (!uuid(owner) || !uuid(product) || !uuid(request)) throw new Error('Invalid pending addition')
      const record: PendingAddition = { version: 1, ownerId: owner.toLowerCase(), requestId: request.toLowerCase(), productId: product.toLowerCase() }
      if (read(record.ownerId).length >= 100) throw new Error('Keep up to 100 pending account additions.')
      const key = keyFor(record), value = JSON.stringify(record)
      const existing = storage.getItem(key)
      if (existing !== null && existing !== value) throw new Error('Pending request already exists')
      storage.setItem(key, value)
      // A failed/ignored write must never lead to an unrecorded account request.
      if (storage.getItem(key) !== value) throw new Error('Pending addition was not stored')
      return record
    },
    acknowledge(record: PendingAddition) {
      const key = keyFor(record), raw = storage.getItem(key)
      if (raw === null) return // Another tab already confirmed this exact request.
      if (JSON.stringify(parse(raw, key, record.ownerId)) !== JSON.stringify(record)) throw new Error('Pending request changed')
      storage.removeItem(key)
      if (storage.getItem(key) !== null) throw new Error('Pending acknowledgement was not stored')
    },
  }
}
