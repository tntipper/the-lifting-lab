import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23RestrictedConnections,
  STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS } from '../scripts/staging-generation-23-restricted-connections.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = Date.parse('2026-09-27T10:00:00.000Z')
const expiresAt = '2026-09-27T10:40:00.000Z'
const deadlineAt = '2026-09-27T10:02:00.000Z'
const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const classifyQueryError = error => error?.code ?? null
const diagnosticFixture = () => {
  const events = []
  return {
    events,
    claim: () => { events.push({ state: 'CLAIMED' }); return { state: 'CLAIMED' } },
    progress: (_record, step) => { events.push({ state: 'RUNNING', ...step }); return { state: 'RUNNING', ...step } },
    hold: (_record, failure) => { events.push({ state: 'HOLD', ...failure }); return { state: 'HOLD', ...failure } },
    pass: () => { events.push({ state: 'PASS' }); return { state: 'PASS' } },
  }
}
const passwords = Object.fromEntries(purposes.map((purpose, index) => [purpose,
  `${String.fromCharCode(65 + index).repeat(63)}${index === 0 ? 'A' : 'z'}`]))
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`

async function armed() {
  let credentials = await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
  credentials = credentials.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialsUrl = data(credentials)
  let source = await readFile(new URL('staging-generation-23-restricted-connections.mjs', scripts), 'utf8')
  source = source.replace('STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = false',
    'STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${credentialsUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(data(source))
}

function runtimeFixture({ connect = async () => { throw Error('denied') }, events = [] } = {}) {
  return input => {
    let closed = false
    events.push({ kind: 'create', purpose: input.purpose, password: input.password })
    return { pool: { async connect() { return connect(input) } }, async close() {
      if (closed) return
      closed = true; events.push({ kind: 'close', purpose: input.purpose })
    } }
  }
}

test('ordinary source is OFF before it can create a database runtime', () => {
  let called = false
  assert.throws(() => createStagingGeneration23RestrictedConnections({ createRuntime() { called = true } }), /unavailable/)
  assert.equal(called, false)
})

test('armed proof accepts the fixed correct-role and drained-session dependencies', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed()
  assert.doesNotThrow(() => create({ createRuntime: runtimeFixture(), classifyQueryError, diagnostic: diagnosticFixture(), readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verifyDrained: async () => ({ status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5,
      controlsEnabled: false, runtimeSessions: 0 }), now: () => start }))
})

test('five correct roles are proved once and every runtime closes before drain proof', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed(), events = [], calls = []
  const proof = create({ createRuntime: runtimeFixture({ events }), classifyQueryError, diagnostic: diagnosticFixture(), readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verifyDrained: async ({ expiresAt: received, signal }) => {
      assert.equal(received, expiresAt); assert.equal(signal.aborted, false)
      return { status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5,
        controlsEnabled: false, runtimeSessions: 0 }
    },
    async verify(input) {
      calls.push(input)
      for (const purpose of purposes) input.createRuntime({ purpose, enabled: true, password: input.passwords[purpose], tlsCa: input.tlsCa })
      return { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false }
    }, now: () => start })
  assert.deepEqual(await proof.prove({ passwords, expiresAt, deadlineAt, signal: new AbortController().signal }), {
    status: 'PASS_RESTRICTED_CONNECTIONS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false,
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].requireClassifiedDenials, true)
  assert.equal(calls[0].classifyQueryError, classifyQueryError)
  const created = events.filter(event => event.kind === 'create')
  assert.equal(created.length, 5)
  for (const purpose of purposes) {
    const correct = created.find(event => event.purpose === purpose && event.password === passwords[purpose])
    assert.ok(correct)
  }
  assert.equal(events.filter(event => event.kind === 'close').length, 5)
  await assert.rejects(proof.prove({ passwords, expiresAt, deadlineAt, signal: new AbortController().signal }), /unavailable/)
})

test('an incomplete correct-role proof fails closed before the drain read', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed()
  let incompleteVerifyCalls = 0
  const incomplete = create({ createRuntime: runtimeFixture(), classifyQueryError, diagnostic: diagnosticFixture(),
    readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verifyDrained: async () => { throw Error('must not drain') },
    verify: async () => { incompleteVerifyCalls++; return { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 4, controlsEnabled: false } }, now: () => start })
  await assert.rejects(incomplete.prove({ passwords, expiresAt, deadlineAt, signal: new AbortController().signal }), /unavailable/)
  assert.equal(incompleteVerifyCalls, 1)
})

test('an aborted or overlong proof makes no connection attempt', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed(), controller = new AbortController(); controller.abort()
  let created = 0
  const proof = create({ createRuntime() { created++ }, classifyQueryError, diagnostic: diagnosticFixture(), readCa() { throw Error('must not read') },
    verifyDrained() { throw Error('must not drain') }, verifyWrongPassword() { throw Error('must not probe') }, now: () => start })
  await assert.rejects(proof.prove({ passwords, expiresAt, deadlineAt, signal: controller.signal }), /unavailable/)
  assert.equal(created, 0)
  const late = create({ createRuntime() { created++ }, classifyQueryError, diagnostic: diagnosticFixture(), readCa() { throw Error('must not read') },
    verifyDrained() { throw Error('must not drain') }, verifyWrongPassword() { throw Error('must not probe') }, now: () => start })
  await assert.rejects(late.prove({ passwords, expiresAt,
    deadlineAt: new Date(start + STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS + 1).toISOString(),
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(created, 0)
})

test('a non-zero or malformed drained-session read cannot pass', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed()
  const proof = create({ createRuntime: runtimeFixture(), classifyQueryError, diagnostic: diagnosticFixture(), readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verify: async () => ({ status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false }),
    async verifyWrongPassword() { return { code: '28P01' } },
    verifyDrained: async () => ({ status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5,
      controlsEnabled: false, runtimeSessions: 1 }), pause: async () => {}, now: () => start })
  await assert.rejects(proof.prove({ passwords, expiresAt, deadlineAt, signal: new AbortController().signal }), /unavailable/)
})

test('closed pooler sessions are reread within the bounded drain budget', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed()
  const diagnostic = diagnosticFixture(), observations = [2, 1, 0], waits = []
  const proof = create({ createRuntime: runtimeFixture(), classifyQueryError, diagnostic,
    readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verify: async () => ({ status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false }),
    verifyWrongPassword: async () => ({ code: '28P01' }),
    verifyDrained: async () => ({ status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme',
      purposes: 5, controlsEnabled: false, runtimeSessions: observations.shift() }),
    pause: async ms => { waits.push(ms) }, now: () => start })
  assert.equal((await proof.prove({ passwords, expiresAt, deadlineAt,
    signal: new AbortController().signal })).status, 'PASS_RESTRICTED_CONNECTIONS')
  assert.deepEqual(waits, [20_000, 20_000])
  assert.equal(diagnostic.events.at(-1).state, 'PASS')
  assert.equal(diagnostic.events.filter(event => event.step === 'drain').length, 3)
})

test('a correct-role transport failure leaves its purpose in the safe HOLD record', async () => {
  const { createStagingGeneration23RestrictedConnections: create } = await armed()
  const diagnostic = diagnosticFixture()
  const proof = create({ createRuntime: runtimeFixture(), classifyQueryError, diagnostic,
    readCa: () => ({ pem: 'fixture', sha256: 'a'.repeat(64) }),
    verify: async () => { throw Object.assign(Error('private transport detail'), {
      safeConnectionFailure: { purpose: 'customer', check: 'connect', firstConnect: null, secondConnect: null },
    }) },
    verifyDrained: async () => { throw Error('must not read') }, now: () => start })
  await assert.rejects(proof.prove({ passwords, expiresAt, deadlineAt,
    signal: new AbortController().signal }), /unavailable/)
  assert.equal(diagnostic.events.at(-1).state, 'HOLD')
  assert.equal(diagnostic.events.at(-1).outcome, 'correct_role_failed')
  assert.doesNotMatch(JSON.stringify(diagnostic.events), /private transport detail/)
})

test('raw wrong-password probe uses only the fixed pooler configuration and returns 28P01', async () => {
  const { createStagingGeneration23WrongPasswordProbe: createProbe } = await armed()
  let configuration, ended = 0
  class Client {
    constructor(config) { configuration = config }
    async connect() { throw Object.assign(Error('private text'), { code: '28P01' }) }
    async end() { ended++ }
  }
  const probe = createProbe({ Client })
  const result = await probe({ purpose: 'cart', password: 'a'.repeat(64),
    tlsCa: { pem: 'fixture', sha256: 'a'.repeat(64) }, signal: new AbortController().signal })
  assert.deepEqual(result, { code: '28P01' })
  assert.equal(ended, 1)
  assert.equal(configuration.host, 'aws-0-eu-west-2.pooler.supabase.com')
  assert.equal(configuration.port, 6543)
  assert.equal(configuration.database, 'postgres')
  assert.equal(configuration.user, 'tll_cart_runtime.qdmvngjwkcsilzmqksme')
  assert.equal(configuration.connectionTimeoutMillis, 3000)
  assert.equal(configuration.ssl.rejectUnauthorized, true)
  assert.equal(configuration.ssl.minVersion, 'TLSv1.2')
  assert.equal(configuration.application_name, 'tll-staging-cart')
})

test('raw probe rejects network errors and closes the client', async () => {
  const { createStagingGeneration23WrongPasswordProbe: createProbe } = await armed()
  let ended = 0
  class Client {
    async connect() { throw Object.assign(Error('private network'), { code: 'ECONNREFUSED' }) }
    async end() { ended++ }
  }
  const probe = createProbe({ Client })
  await assert.rejects(probe({ purpose: 'customer', password: 'b'.repeat(64),
    tlsCa: { pem: 'fixture', sha256: 'b'.repeat(64) }, signal: new AbortController().signal }), /unavailable/)
  assert.equal(ended, 1)
})

test('raw probe closes immediately when its signal aborts', async () => {
  const { createStagingGeneration23WrongPasswordProbe: createProbe } = await armed()
  let ended = 0
  class Client {
    async connect() { return new Promise(() => {}) }
    async end() { ended++ }
  }
  const controller = new AbortController(), probe = createProbe({ Client })
  const running = probe({ purpose: 'bridge', password: 'c'.repeat(64),
    tlsCa: { pem: 'fixture', sha256: 'c'.repeat(64) }, signal: controller.signal })
  controller.abort()
  await assert.rejects(running, /unavailable/)
  assert.equal(ended, 1)
})
