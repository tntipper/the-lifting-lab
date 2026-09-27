import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'
import { EventEmitter } from 'node:events'
import { rootCertificates } from 'node:tls'
import { X509Certificate, createHash } from 'node:crypto'
import { build } from 'esbuild'
import { ENTRYPOINTS, IDENTITY_QUERY, MEMBERSHIP_QUERY, FUNCTION_MATRIX_QUERY,
  PRIVATE_TABLE_DENIAL_QUERY, OWN_PROBE } from '../scripts/staging-generation-6-connection-verifier.mjs'
import { IDENTITIES } from '../scripts/staging-generation-6-credentials.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const data = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const bundled = await build({ entryPoints: ['lib/server/staging-postgres.ts'], bundle: true,
  platform: 'node', format: 'esm', packages: 'external', write: false, logLevel: 'silent' })
const { createStagingPostgresRuntime, stagingPostgresSqlstate, stagingPostgresConnectionDiagnostic } = await import(data(bundled.outputFiles[0].text))
const pem = rootCertificates.find(value => {
  const certificate = new X509Certificate(value)
  return certificate.ca && Date.parse(certificate.validFrom) < Date.now()
    && Date.parse(certificate.validTo) > Date.now()
})
assert.ok(pem)
const tlsCa = { pem, sha256: createHash('sha256').update(new X509Certificate(pem).raw).digest('hex') }
const sourceCommit = 'a'.repeat(40)
const purposes = ['customer', 'cart', 'broker', 'provisional', 'bridge']
const passwords = Object.fromEntries(purposes.map((purpose, index) => [purpose,
  `${String.fromCharCode(65 + index).repeat(64)}`]))

async function armedModules(expiresAt) {
  let credentials = await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8')
  credentials = credentials.replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
    `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  let wrapper = await readFile(new URL('staging-generation-23-restricted-connections.mjs', scripts), 'utf8')
  wrapper = wrapper.replace('STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = false',
    'STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = true')
    .replace("from './staging-generation-23-credentials.mjs'", `from '${data(credentials)}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  let journal = await readFile(new URL('staging-generation-23-connection-diagnostic.mjs', scripts), 'utf8')
  journal = journal.replace('STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED = false',
    'STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED = true')
    .replaceAll('import.meta.dirname', JSON.stringify(fileURLToPath(scripts)))
    .replaceAll("from './", `from '${scripts.href}`)
  return {
    wrapper: await import(data(wrapper)), journal: await import(data(journal)),
  }
}

function fakeRuntime({ expiresAt, failAt, events }) {
  const attempts = new Map()
  return ({ purpose, enabled, password, tlsCa: suppliedCa }) => {
    assert.equal(enabled, true)
    assert.equal(password, passwords[purpose], 'the verifier must forward the current purpose password')
    assert.deepEqual(suppliedCa, tlsCa, 'the verifier must forward the pinned CA')
    events.push(`create:${purpose}`)
    const login = IDENTITIES[purpose].login
    const client = Object.assign(new EventEmitter(), {
      getTransactionStatus() { return 'I' },
      async query(sql) {
        const check = sql === IDENTITY_QUERY ? 'identity' : sql === MEMBERSHIP_QUERY ? 'membership'
          : sql === FUNCTION_MATRIX_QUERY ? 'matrix' : sql === PRIVATE_TABLE_DENIAL_QUERY ? 'table_denial'
            : 'own_probe'
        events.push(`${purpose}:${check}`)
        if (failAt === `${purpose}:${check}`) throw Object.assign(Error('synthetic network fault'), { code: 'ECONNRESET' })
        if (check === 'identity') return { rows: [{ database: 'postgres', current_role: login,
          session_role: login, application_name: 'Supavisor', can_login: true, inherits: false,
          superuser: false, bypass_rls: false, create_role: false, create_database: false,
          replication: false, valid_until: expiresAt }] }
        if (check === 'membership') return { rows: [{ granted: IDENTITIES[purpose].membership,
          member: login, grantor: 'postgres', admin_option: false, inherit_option: true, set_option: false }] }
        if (check === 'matrix') return { rows: Object.entries(ENTRYPOINTS).flatMap(([owner, signatures]) =>
          signatures.map(signature => ({ purpose: owner, signature, present: true, allowed: owner === purpose }))) }
        if (check === 'table_denial') throw Object.assign(Error('synthetic permission denial'), { code: '42501' })
        if (OWN_PROBE[purpose][2] === 'error') throw Object.assign(Error('synthetic disabled operation'), {
          code: purpose === 'cart' ? '55000' : '22023',
        })
        return { rows: [{ result: { status: 'rejected' } }] }
      },
      release() { events.push(`release:${purpose}`) },
    })
    const driver = Object.assign(new EventEmitter(), {
      async connect() {
        const attempt = (attempts.get(purpose) ?? 0) + 1
        attempts.set(purpose, attempt)
        events.push(`connect:${purpose}:${attempt}`)
        if (failAt === `${purpose}:connect_both`
          || (failAt === `${purpose}:connect_first` && attempt === 1)
          || (failAt === `${purpose}:connect_after_wrong` && attempt >= 2))
          throw Object.assign(Error(`SYNTHETIC_PRIVATE ${password}`), { code: '28P01' })
        return client
      },
      async end() { events.push(`close:${purpose}`) },
    })
    return createStagingPostgresRuntime({ purpose, enabled, password, tlsCa: suppliedCa },
      { createPool: config => {
        assert.equal(config.password, password)
        assert.equal(config.ssl.ca, suppliedCa.pem)
        assert.equal(config.ssl.rejectUnauthorized, true)
        return driver
      } })
  }
}

async function exercise(failAt) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-assembled-'))
  const path = join(directory, 'connection.json')
  const expiresAt = new Date(Date.now() + 12 * 60_000).toISOString()
  const deadlineAt = new Date(Date.now() + 5 * 60_000).toISOString()
  const { wrapper, journal } = await armedModules(expiresAt)
  const durable = journal.createStagingGeneration23ConnectionDiagnostic({ path, sourceCommit })
  const diagnostic = failAt === 'journal_write' ? {
    claim: input => durable.claim(input),
    progress: (record, detail) => {
      if (detail.check === 'matrix') throw Error('synthetic journal failure')
      return durable.progress(record, detail)
    },
    hold: (record, detail) => durable.hold(record, detail),
    pass: record => durable.pass(record),
  } : durable
  const events = [], sessions = [2, 1, 0]
  try {
    const proof = wrapper.createStagingGeneration23RestrictedConnections({
      createRuntime: fakeRuntime({ expiresAt, failAt, events }), diagnostic,
      classifyQueryError: stagingPostgresSqlstate,
      classifyConnectError: stagingPostgresConnectionDiagnostic,
      readCa: () => tlsCa,
      verifyWrongPassword: async ({ purpose }) => {
        events.push(`wrong:${purpose}`); return { code: '28P01' }
      },
      verifyDrained: async () => ({ status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme',
        purposes: 5, controlsEnabled: false, runtimeSessions: sessions.shift() }),
      pause: async () => {},
    })
    if (failAt && !failAt.endsWith(':connect_first')) await assert.rejects(proof.prove({ passwords, expiresAt, deadlineAt,
      signal: new AbortController().signal }), /unavailable/)
    else assert.equal((await proof.prove({ passwords, expiresAt, deadlineAt,
      signal: new AbortController().signal })).status, 'PASS_RESTRICTED_CONNECTIONS')
    return { record: JSON.parse(readFileSync(path, 'utf8')), events }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('actual connection wrapper, verifier and durable journal pass with delayed session drain', async () => {
  const { record, events } = await exercise(null)
  assert.equal(record.state, 'PASS')
  assert.equal(record.step, 'complete')
  assert.equal(events.filter(value => value.startsWith('wrong:')).length, 5)
  assert.equal(events.filter(value => value.startsWith('close:')).length, 10)
  assert.equal(events.filter(value => value.startsWith('customer:identity')).length, 2)
})

test('a network fault cannot count as a permission denial and preserves role/check', async () => {
  const { record, events } = await exercise('cart:own_probe')
  assert.equal(record.state, 'HOLD')
  assert.equal(record.outcome, 'correct_role_failed')
  assert.equal(record.purpose, 'cart')
  assert.equal(record.check, 'own_probe')
  assert.equal(events.filter(value => value.startsWith('wrong:')).length, 0)
  assert.equal(events.filter(value => value.startsWith('close:')).length, 2)
})

test('the real wrapper retries a transient authentication rejection with the same supplied password', async () => {
  const { record, events } = await exercise('broker:connect_first')
  assert.equal(record.state, 'PASS')
  assert.ok(events.includes('connect:broker:2'))
  assert.doesNotMatch(JSON.stringify(record), /SYNTHETIC_PRIVATE|[A-E]{32}/)
})

test('two authentication rejections cannot become a successful connection proof', async () => {
  const { record, events } = await exercise('broker:connect_both')
  assert.equal(record.state, 'HOLD')
  assert.equal(record.check, 'connect_retry')
  assert.deepEqual(record.connectionEvidence, {
    first: { operation: 'driver', category: 'authentication', code: '28P01', elapsed: 'under_1s' },
    second: { operation: 'driver', category: 'authentication', code: '28P01', elapsed: 'under_1s' },
  })
  assert.equal(events.filter(value => value.startsWith('wrong:')).length, 0)
  assert.doesNotMatch(JSON.stringify(record), /SYNTHETIC_PRIVATE|[A-E]{32}/)
})

test('a pooler rejection after the wrong-password checks holds before activation', async () => {
  const { record, events } = await exercise('broker:connect_after_wrong')
  assert.equal(record.state, 'HOLD')
  assert.equal(record.outcome, 'final_good_failed')
  assert.equal(record.purpose, 'broker')
  assert.equal(record.check, 'connect_retry')
  assert.equal(events.filter(value => value.startsWith('wrong:')).length, 5)
  assert.equal(record.connectionEvidence?.first?.category, 'authentication')
  assert.equal(record.connectionEvidence?.second?.category, 'authentication')
})

test('a diagnostic write failure stops before password and later activation checks', async () => {
  const { record, events } = await exercise('journal_write')
  assert.equal(record.state, 'HOLD')
  assert.equal(record.outcome, 'correct_role_failed')
  assert.equal(events.filter(value => value.startsWith('wrong:')).length, 0)
  assert.equal(events.filter(value => value.startsWith('close:')).length, 1)
})
