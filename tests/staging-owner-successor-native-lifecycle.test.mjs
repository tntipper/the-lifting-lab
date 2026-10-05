import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { successorFixtureModules } from './fixtures/owner-successor-native-modules.mjs'
import { OWNER_SUCCESSOR_WINDOW_ID } from '../scripts/staging-owner-successor-registration.mjs'

const startedAt = '2030-01-01T12:00:00.000Z', expiresAt = '2030-01-01T13:00:00.000Z'
const at = Date.parse(startedAt) + 60_000
const modules = await successorFixtureModules({ startedAt, expiresAt })
const hosted = await modules.import('staging-owner-successor-fixed-hosted-adapters.mjs')
const edge = await modules.import('staging-owner-successor-edge-replacer.mjs')
const observer = await modules.import('staging-owner-successor-final-observer.mjs')
const journals = await modules.import('staging-owner-successor-whole-route-journal.mjs')
const settings = await modules.import('staging-owner-successor-settings-coordinator.mjs')
const material = await modules.import('staging-owner-successor-password-material.mjs')
const deferred = () => {
  let resolve
  const promise = new Promise(yes => { resolve = yes })
  return { promise, resolve }
}
const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('synthetic-vercel'), previewBypass: Buffer.from('synthetic-bypass') })
const journal = () => ({ read: () => null, claim() {}, dispatch() {}, confirm() {}, hold() {} })
function hostedFactory(factories) {
  const no = () => assert.fail('No native/default factory may be invoked')
  return hosted.createOwnerSuccessorFixedHostedAdapters({ credentials: credentials(),
    fetch: async () => assert.fail('No hosted I/O'), expiresAt, now: () => at,
    expectedDeployment: { deploymentId: 'dpl_synthetic', immutableUrl: 'https://synthetic.vercel.app',
      gitSourceCommit: 'a'.repeat(40) }, settingsJournal: journal(), factories: {
      createSupabase: no, createVercel: no, createSurface: no, createInventory: no,
      createReplacer: no, createEdge: no, createCoordinator: no, createReadback: no,
      readPredecessor: no, ...factories,
    } })
}
test('baseline disposal while predecessor is pending prevents every subsequent service factory/read', async () => {
  const entered = deferred(), reply = deferred()
  const factory = hostedFactory({ async readPredecessor() { entered.resolve(); return reply.promise } })
  const pending = factory.ports.readBaseline({ signal: new AbortController().signal })
  const rejected = assert.rejects(pending, /unavailable/)
  await entered.promise; factory.dispose()
  reply.resolve({ status: 'PASS_RETIRED', receiptSha256: 'a'.repeat(64) })
  await rejected
  assert.throws(() => factory.getDatabaseMaterial(), /unavailable/)
})
test('settings disposal while inventory is pending prevents Edge/coordinator writes and disposes inventory', async () => {
  const entered = deferred(), reply = deferred(); let disposed = 0, writes = 0
  const factory = hostedFactory({ createInventory: () => ({
    async readTargets() { entered.resolve(); return reply.promise }, dispose() { disposed++ },
  }), createCoordinator: () => ({ async run() { writes++; return { status: 'SETTINGS_REPLACED_UNVERIFIED' } } }) })
  const pending = factory.ports.replaceSettings({ signal: new AbortController().signal })
  const rejected = assert.rejects(pending, /unavailable/)
  await entered.promise; factory.dispose(); reply.resolve([{ name: 'synthetic' }]); await rejected
  assert.equal(disposed, 1); assert.equal(writes, 0)
  assert.throws(() => factory.getDatabaseMaterial(), /unavailable/)
})
test('disposal during coordinator replacement aborts downstream and prevents replacement two or metadata PASS', async () => {
  const entered = deferred(), reply = deferred(), caller = new AbortController()
  const targets = material.VERCEL_PASSWORD_NAMES.map((name, index) => ({ name,
    id: `synthetic-${index}`, branch: 'codex/tll-integration' }))
  let projection, downstream, replacements = 0, replacersDisposed = 0, edgeDisposed = 0, record
  const settingsJournal = { read: () => record ?? null,
    claim: () => (record = { state: 'READY', receiptDigests: [] }),
    dispatch: () => (record = { ...record, state: 'DISPATCHED' }),
    confirm: (_previous, digest) => (record = { state: 'READY', receiptDigests: [...record.receiptDigests, digest] }),
    hold: () => (record = { ...record, state: 'HOLD' }),
  }
  const factory = hosted.createOwnerSuccessorFixedHostedAdapters({ credentials: credentials(), expiresAt, now: () => at,
    fetch: async () => assert.fail('No hosted I/O'), expectedDeployment: {
      deploymentId: 'dpl_synthetic', immutableUrl: 'https://synthetic.vercel.app', gitSourceCommit: 'a'.repeat(40),
    }, settingsJournal, factories: {
      createInventory: () => ({ readTargets: async () => targets, dispose() {} }),
      createEdge: () => ({ stageSecret: async () => assert.fail('No Edge replacement after disposal'),
        dispose() { edgeDisposed++ } }),
      createReplacer: () => ({ async replace(_target, _value, { signal }) {
        replacements++; downstream = signal; entered.resolve(); await reply.promise
        if (signal.aborted) throw Error('Synthetic cancelled replacement')
        assert.fail('The paused replacement must be aborted')
      }, dispose() { replacersDisposed++ } }),
      createCoordinator: input => {
        const real = settings.createOwnerSuccessorSettingsCoordinator(input)
        return { run: args => { projection = args.projection; return real.run(args) } }
      },
    } })
  const pending = factory.ports.replaceSettings({ signal: caller.signal })
  const rejected = assert.rejects(pending, /unavailable/)
  await entered.promise
  assert.equal(replacements, 1); assert.equal(downstream.aborted, false)
  assert.ok(Object.values(projection.vercel).every(value => typeof value === 'string'))
  factory.dispose()
  assert.equal(downstream.aborted, true); assert.equal(caller.signal.aborted, false)
  reply.resolve(); await rejected
  assert.equal(replacements, 1); assert.equal(replacersDisposed, 1); assert.equal(edgeDisposed, 1)
  assert.equal(record.state, 'HOLD')
  for (const group of [projection.vercel, projection.supabase])
    assert.ok(Object.values(group).every(value => value === undefined))
})
test('projection values are cleared when inventory rejects before coordinator owns them', async () => {
  const groups = [], originalKeys = Object.keys
  const factory = hostedFactory({ createInventory: () => ({
    readTargets: async () => { throw Error('Synthetic inventory failure') }, dispose() {},
  }) })
  let pending
  // Observe only the synchronous synthetic projection checks preceding the first await.
  // Return exactly the original keys and restore immediately; no implementation is altered.
  Object.keys = value => {
    const keys = originalKeys(value)
    if (keys.length === 5 && keys.every(key => /^TLL_STAGING_.*_DATABASE_PASSWORD$/.test(key))
      || keys.length === 2 && keys.includes('TLL_STAGING_BROKER_READINESS_WINDOW')
        && keys.includes('TLL_STAGING_BROKER_DATABASE_PASSWORD')) groups.push(value)
    return keys
  }
  try { pending = factory.ports.replaceSettings({ signal: new AbortController().signal }) }
  finally { Object.keys = originalKeys }
  try {
    await assert.rejects(pending, /unavailable/)
    const unique = [...new Set(groups)]
    assert.equal(unique.length, 2)
    for (const group of unique) assert.ok(Object.values(group).every(value => value === undefined))
    assert.throws(() => factory.getDatabaseMaterial(), /unavailable/)
  } finally { factory.dispose() }
})
const response = () => ({ status: 201, redirected: false, headers: { get: () => null } })
for (const [label, invalid] of [['NaN', NaN], ['undefined', undefined], ['rewind', at - 1]])
  test(`Edge paused response cannot return STAGED after later clock ${label}`, async () => {
    const entered = deferred(), reply = deferred(); let clock = at, calls = 0
    const replacer = edge.createOwnerSuccessorEdgeReplacer({ token: Buffer.from('synthetic-token'), expiresAt,
      now: () => clock, fetch: async () => { calls++; entered.resolve(); return reply.promise } })
    try {
      const pending = replacer.stageSecret({ name: 'TLL_STAGING_BROKER_DATABASE_PASSWORD',
        value: 'a'.repeat(64), signal: new AbortController().signal })
      const rejected = assert.rejects(pending, /unavailable/)
      await entered.promise; clock = invalid; reply.resolve(response()); await rejected
      assert.equal(calls, 1)
    } finally { replacer.dispose() }
  })
test('Edge disposal with paused response aborts operation and discards late response without STAGED', async () => {
  const entered = deferred(), reply = deferred(); let cancelled = 0, signal
  const replacer = edge.createOwnerSuccessorEdgeReplacer({ token: Buffer.from('synthetic-token'), expiresAt,
    now: () => at, fetch: async (_url, input) => { signal = input.signal; entered.resolve(); return reply.promise } })
  const pending = replacer.stageSecret({ name: 'TLL_STAGING_BROKER_DATABASE_PASSWORD', value: 'a'.repeat(64),
    signal: new AbortController().signal })
  const rejected = assert.rejects(pending, /unavailable/)
  await entered.promise; replacer.dispose(); await rejected
  assert.equal(signal.aborted, true)
  reply.resolve({ ...response(), body: { cancel() { cancelled++ } } })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(cancelled, 1)
})
for (const [queryId, expected] of [['tll-staging-generation-23-final-check/v1', 'READ_UNAVAILABLE'],
  ['tll-owner-successor-final-check/v1', 'PASS_FINAL_RETIRED']])
  test(`final observer requires fresh query ID (${queryId})`, async () => {
    let record, outcome, reads = 0
    const token = Buffer.from(`sbp_${'a'.repeat(40)}`)
    const observed = observer.createOwnerSuccessorFinalObserver({ now: () => at,
      readToken: async () => { reads++; return token }, post: async () => [],
      validate: () => ({ status: 'PASS_FINAL_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme', queryId,
        receiptSha256: 'a'.repeat(64) }), journal: {
        read: () => record, claim: () => (record = { state: 'CLAIMED' }),
        dispatch: () => (record = { state: 'DISPATCHED' }),
        finish: (_previous, value) => { outcome = value; return (record = { state: 'FINISHED' }) },
      } })
    assert.equal((await observed.observe({ signal: new AbortController().signal })).status, expected)
    assert.equal(outcome, expected); assert.equal(reads, 1); assert.ok(token.every(byte => byte === 0))
  })
for (const [field, value] of [['sourceCommit', 'c'.repeat(40)], ['windowId', 'd5180b08-79ee-43e8-96d4-4f73621fecbf']])
  test(`whole-route journal rejects persisted ${field} tampering before progress`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'tll-successor-journal-lifecycle-')), path = join(directory, 'route.json')
    try {
      const identity = { windowId: OWNER_SUCCESSOR_WINDOW_ID, sourceCommit: 'a'.repeat(40), executionCommit: 'b'.repeat(40),
        manifestSha256: 'a'.repeat(64), startedAt, expiresAt }
      const journal = journals.createOwnerSuccessorWholeRouteJournal({ path, identity, now: () => at })
      const claimed = journal.claim()
      const record = JSON.parse(readFileSync(path, 'utf8')); record.identity[field] = value
      writeFileSync(path, `${JSON.stringify(record)}\n`, { mode: 0o600 })
      assert.throws(() => journal.read(), /unavailable/)
      assert.throws(() => journal.verify(claimed, 'baseline'), /unavailable/)
    } finally { rmSync(directory, { recursive: true, force: true }) }
  })
