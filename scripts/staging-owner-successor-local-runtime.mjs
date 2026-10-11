/** Local-only capability + orchestration. The sole registered port is a built-in synthetic mock. */
import { createHash } from 'node:crypto'
import { createSuccessorFixtureJournal, SUCCESSOR_PHASES, SHUTDOWN_PHASES, FIXTURE_CHECKS } from './staging-owner-successor-fixture.mjs'
import { createSuccessorDurableJournal } from './staging-owner-successor-durable-journal.mjs'
const capabilities = new WeakMap(), mocks = new WeakMap()
const unavailable = () => { throw Error('Successor local capability unavailable') }
const samePlan = (a, b) => ['windowId', 'sourceSha', 'startedAtMs', 'expiresAtMs'].every(k => a?.[k] === b?.[k])
export function issueSyntheticSuccessorCapability({ plan, action, nowMs, validUntilMs, reviewedSourceSha } = {}) {
  createSuccessorFixtureJournal(plan)
  if (!['LOCAL_RUN', 'LOCAL_RECOVERY'].includes(action) || reviewedSourceSha !== plan.sourceSha
    || !Number.isSafeInteger(nowMs) || nowMs < 0 || !Number.isSafeInteger(validUntilMs)
    || validUntilMs <= nowMs || validUntilMs - nowMs > 30_000) unavailable()
  const capability = Object.freeze({})
  capabilities.set(capability, { plan: { ...plan }, action, nowMs, validUntilMs })
  return capability
}
export function createMockSuccessorTransport({ plan, failAt = null, hangAt = null, lateAt = null, crashAt = null,
  uncertainSettlement = false, initialEntries = [] } = {}) {
  createSuccessorFixtureJournal(plan)
  if ([failAt, hangAt, lateAt, crashAt].some(p => p !== null && !SUCCESSOR_PHASES.includes(p))
    || typeof uncertainSettlement !== 'boolean' || !Array.isArray(initialEntries)) unavailable()
  const credentials = [Buffer.from('TLL-SYNTHETIC-MANAGEMENT-FIXTURE'), Buffer.from('TLL-SYNTHETIC-VERCEL-FIXTURE'),
    Buffer.from('TLL-SYNTHETIC-PREVIEW-FIXTURE')]
  let disposed = false
  const state = { backend: false, website: false, retired: true }, calls = [], pending = new Set()
  const apply = phase => {
    if (phase === 'databaseSetup') state.retired = false
    if (phase === 'databaseEnable') state.backend = true
    if (phase === 'surfaceEnable') state.website = true
    if (phase === 'backendDisable') state.backend = false
    if (phase === 'surfaceFreeze') state.website = false
    if (phase === 'databaseRetire') state.retired = true
  }
  // On crash, treat every dispatched mutation as potentially applied; never assume it did not happen.
  for (const entry of initialEntries) if (SUCCESSOR_PHASES.includes(entry?.phase)) apply(entry.phase)
  const port = Object.freeze({})
  mocks.set(port, { plan: { ...plan }, credentials, state, calls,
    async run(phase, signal) {
      if (disposed) unavailable()
      calls.push(phase); apply(phase)
      if (phase === crashAt) process.exit(17) // only the fixed fixture child receives this scenario
      if (phase === failAt) throw Error('Synthetic phase failure')
      if (phase === hangAt || phase === lateAt) {
        let timer, onAbort
        const task = new Promise((resolve, reject) => {
          onAbort = () => { if (phase !== lateAt) reject(Error('Synthetic aborted phase')) }
          signal.addEventListener('abort', onAbort, { once: true })
          if (phase === lateAt) timer = setTimeout(() => { apply(phase); resolve() }, 40)
          if (signal.aborted) onAbort()
        })
        pending.add(task)
        try { await task } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); pending.delete(task) }
      }
      if (phase === 'finalReadback' && (state.backend || state.website || !state.retired || pending.size))
        throw Error('Synthetic final retirement failed')
      const checks = Object.fromEntries(FIXTURE_CHECKS[phase].map(k => [k, true]))
      return { phase, windowId: plan.windowId, sourceSha: plan.sourceSha,
        receiptSha256: createHash('sha256').update(JSON.stringify({ phase, checks })).digest('hex'), checks }
    },
    async settle() {
      if (uncertainSettlement) return false
      await Promise.allSettled([...pending]); return pending.size === 0
    },
    isDisposed: () => disposed,
    dispose() { disposed = true; for (const bytes of credentials) bytes.fill(0) },
  })
  return port
}
/** Non-secret test observations only; buffer references are exposed solely for wipe assertions. */
export function inspectMockSuccessorTransport(port) {
  const value = mocks.get(port); if (!value) unavailable()
  return { calls: [...value.calls], state: { ...value.state }, credentialBuffers: value.credentials }
}
const terminal = status => Object.freeze({ schema: 'tll-successor-local-terminal/v1', status,
  authorization: 'NONE', provenance: 'SYNTHETIC_LOCAL_ONLY' })
async function bounded(work, limit, controller) {
  let timer
  try {
    return await Promise.race([Promise.resolve().then(work), new Promise((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(Error('Synthetic deadline')) }, limit)
    })])
  } finally { clearTimeout(timer) }
}
export async function runSuccessorLocalOnce({ capability, port, root, plan, action, now = Date.now,
  phaseTimeoutMs = 100, signal = new AbortController().signal, journalIo } = {}) {
  const grant = capabilities.get(capability)
  capabilities.delete(capability) // every attempted use consumes it, including a denied action
  const transport = mocks.get(port)
  let at
  try { at = now() } catch { transport?.dispose(); return terminal('LOCAL_CAPABILITY_DENIED') }
  if (!grant || !transport || transport.isDisposed() || !samePlan(grant.plan, plan) || !samePlan(transport.plan, plan)
    || grant.action !== action || !Number.isSafeInteger(at) || at < 0
    || at < grant.nowMs || at >= grant.validUntilMs || at < plan.startedAtMs
    || at >= plan.expiresAtMs + (action === 'LOCAL_RECOVERY' ? 15 * 60_000 : 0)
    || !Number.isInteger(phaseTimeoutMs) || phaseTimeoutMs < 1 || phaseTimeoutMs > 1000
    || !signal || typeof signal.addEventListener !== 'function') {
    transport?.dispose(); return terminal('LOCAL_CAPABILITY_DENIED')
  }
  let journal, record, controller
  const step = async phase => {
    if (!SHUTDOWN_PHASES.includes(phase) && signal.aborted) throw Error('Synthetic cancelled')
    record = journal.dispatch(phase, now()) // exclusive fsynced dispatch before touching the mock
    if (record.pending !== phase) throw Error('Synthetic reserve hold')
    controller = new AbortController()
    const abort = () => controller.abort()
    if (!SHUTDOWN_PHASES.includes(phase)) signal.addEventListener('abort', abort, { once: true })
    try {
      const proof = await bounded(() => transport.run(phase, controller.signal), phaseTimeoutMs, controller)
      if (controller.signal.aborted) throw Error('Synthetic late phase')
      record = journal.observe(proof, now())
    } finally { signal.removeEventListener('abort', abort) }
  }
  try {
    journal = createSuccessorDurableJournal({ root, plan, recovering: action === 'LOCAL_RECOVERY',
      ...(journalIo ? { io: journalIo } : {}) })
    record = journal.read()
    if (action === 'LOCAL_RECOVERY') {
      if (record.state === 'ACTIVE') record = journal.hold(now())
      record = journal.recover(now())
      for (const phase of SHUTDOWN_PHASES) await step(phase)
    } else {
      for (const phase of SUCCESSOR_PHASES) await step(phase)
    }
    return terminal(record.state === 'FIXTURE_PASS' ? 'LOCAL_SEQUENCE_PASS' : 'LOCAL_FAILURE_SHUTDOWN_VERIFIED')
  } catch {
    controller?.abort()
    try {
      // Wait for cancelled/late mock writes before any OFF mutation; inability to prove settlement stays HOLD.
      if (!journal || !await bounded(() => transport.settle(), 100, new AbortController()))
        return terminal('LOCAL_RECONCILIATION_REQUIRED')
      record = journal.read()
      if (record.state === 'ACTIVE') record = journal.hold(now())
      if (record.state !== 'SHUTDOWN_REQUIRED') return terminal('LOCAL_RECONCILIATION_REQUIRED')
      record = journal.recover(now())
      for (const phase of SHUTDOWN_PHASES) await step(phase)
      return terminal('LOCAL_FAILURE_SHUTDOWN_VERIFIED')
    } catch { return terminal('LOCAL_RECONCILIATION_REQUIRED') }
  } finally { transport.dispose() }
}
