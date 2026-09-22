import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { STAGING_BROKER_PROVIDER } from '../scripts/staging-provider-broker-rotation.mjs'
import {
  createHostedBaselineObservationJournal,
  createHostedBaselineCompositionFromFactories,
  createTrackedHostedBaselineFetch,
  projectHostedBaselineObservation,
  HOSTED_BASELINE_SESSION_SCHEMA,
  runHostedBaselineSession,
} from '../scripts/staging-account-hosted-baseline-session.mjs'

const makeJournal = () => {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-hosted-baseline-')), 'observation.json')
  return { path, journal: createHostedBaselineObservationJournal({ path, makeRunId: () => '11111111-1111-4111-8111-111111111111', now: Date.now }) }
}
const credential = name => Buffer.from(`${name}-credential-secret`, 'utf8')

test('composition factories keep the API token and readiness bypass separate', async () => {
  const supabaseCredential = credential('supabase')
  const vercelCredential = credential('vercel-api')
  const protectionBypassCredential = credential('preview-bypass')
  const seen = {}
  const makeBinding = name => input => { seen[name] = input; return { dispose: () => {} } }
  const composition = await createHostedBaselineCompositionFromFactories({
    factories: {
      supabase: makeBinding('supabase'), vercel: makeBinding('vercel'), surface: makeBinding('surface'),
      composition: ({ supabase, vercel, surface }) => ({ observe: async () => ({ supabase, vercel, surface }), dispose: () => {} }),
    },
    supabaseCredential, vercelCredential, protectionBypassCredential, fetch: async () => { throw Error('must not fetch') },
  })
  assert.equal(seen.supabase.managementToken, supabaseCredential)
  assert.equal(seen.supabase.vercelToken, undefined)
  assert.equal(seen.vercel.vercelToken, vercelCredential)
  assert.equal(seen.vercel.protectionBypassToken, undefined)
  assert.equal(seen.surface.vercelToken, vercelCredential)
  assert.equal(seen.surface.protectionBypassToken, protectionBypassCredential)
  await composition.dispose()
})

test('journal records a mode-0600 exclusive intent then a secret-free terminal receipt', () => {
  const { path, journal } = makeJournal()
  const intent = journal.claim()
  journal.finish(intent, { ...intent, state: 'OBSERVATION_RECORDED', updatedAt: new Date().toISOString(), status: 'HOLD', reasonCodes: ['provider_enabled'], observationHash: createHash('sha256').update('receipt').digest('hex') })
  assert.equal(statSync(path).mode & 0o777, 0o600)
  const text = readFileSync(path, 'utf8')
  assert.match(text, new RegExp(HOSTED_BASELINE_SESSION_SCHEMA))
  assert.doesNotMatch(text, /credential-secret/)
  assert.equal(JSON.parse(text).state, 'OBSERVATION_RECORDED')
  assert.equal(JSON.parse(text).status, 'HOLD')
})

test('journal rejects a second claim after an intent or terminal record', () => {
  const { journal } = makeJournal()
  journal.claim()
  assert.throws(() => journal.claim(), /unavailable/)
})

test('journal rejects failure reason codes outside the finite diagnostic set', () => {
  const { journal } = makeJournal()
  const intent = journal.claim()
  assert.throws(() => journal.finish(intent, { ...intent, state: 'OBSERVATION_FAILED', status: 'FAILED', reasonCodes: ['private_provider_error'] }), /unavailable/)
  assert.equal(journal.read().state, 'INTENT_RECORDED')
})

test('failure waits for the operation to settle, scrubs credentials, and records no secret', async () => {
  const { path, journal } = makeJournal()
  const supplied = []; const received = []
  let settled = false
  const result = await runHostedBaselineSession({
    journal,
    deadlineMs: 1,
    setTimer: callback => { callback(); return 1 },
    clearTimer: () => {},
    verifyManifest: async () => {},
    readCredential: async selector => { const item = credential(selector); supplied.push(item); return item },
    createComposition: async ({ supabaseCredential, vercelCredential, protectionBypassCredential }) => {
      received.push(supabaseCredential, vercelCredential, protectionBypassCredential)
      return {
      observe: async () => { await Promise.resolve(); settled = true; throw Error('internal secret detail') },
      dispose: async () => {},
      }
    },
  })
  assert.equal(settled, true)
  assert.equal(result.status, 'OBSERVATION_FAILED')
  assert.deepEqual(result.reasonCodes, ['deadline_or_abort'])
  assert.ok(supplied.every(item => item.every(byte => byte === 0)))
  assert.ok(received.every(item => item.every(byte => byte === 0)))
  const record = readFileSync(path, 'utf8')
  assert.doesNotMatch(record, /internal secret detail|credential-secret/)
  assert.deepEqual(JSON.parse(record).reasonCodes, ['deadline_or_abort'])
})

test('terminal failure journal keeps only bounded construction and observation reason codes', async () => {
  const cases = [
    ['construction', 'composition_construction_unavailable'],
    ['classified-read', 'database_read_unavailable'],
    ['unknown-error', 'observation_unavailable'],
    ['projection', 'observation_projection_unavailable'],
  ]
  for (const [kind, expected] of cases) {
    const { path, journal } = makeJournal()
    const supplied = []
    const result = await runHostedBaselineSession({
      journal, verifyManifest: async () => {},
      readCredential: async selector => { const item = credential(selector); supplied.push(item); return item },
      createComposition: async () => {
        if (kind === 'construction') throw Error('private provider response and token')
        return { observe: async () => {
          if (kind === 'projection') return { privateToken: 'private provider response and token' }
          const error = Error('private provider response and token')
          if (kind === 'classified-read') error.code = 'database_read_unavailable'
          else error.code = 'private_provider_error'
          throw error
        }, dispose: async () => {} }
      },
    })
    assert.equal(result.status, 'OBSERVATION_FAILED')
    assert.deepEqual(result.reasonCodes, [expected])
    const record = readFileSync(path, 'utf8')
    assert.deepEqual(JSON.parse(record).reasonCodes, [expected])
    assert.doesNotMatch(record, /private provider response|token/i)
    assert.ok(supplied.every(item => item.every(byte => byte === 0)))
  }
})

test('missing bypass credential does not consume the one-shot journal and wipes earlier credentials', async () => {
  const { journal } = makeJournal()
  const supplied = []
  const result = await runHostedBaselineSession({
    journal, verifyManifest: async () => {},
    readCredential: async selector => {
      if (selector === 'vercel-bypass') throw Error('private keychain diagnostic')
      const item = credential(selector); supplied.push(item); return item
    },
    createComposition: async () => { throw Error('must not run') },
  })
  assert.deepEqual(result, { status: 'CREDENTIAL_UNAVAILABLE', target: 'qdmvngjwkcsilzmqksme' })
  assert.equal(journal.read(), null)
  assert.ok(supplied.every(item => item.every(byte => byte === 0)))
})

for (const [selector, size] of [['vercel', 513], ['vercel-bypass', 1025]]) {
  test(`oversize ${selector} credential does not claim the journal`, async () => {
    const { journal } = makeJournal()
    const supplied = []
    const result = await runHostedBaselineSession({
      journal, verifyManifest: async () => {},
      readCredential: async name => {
        const item = name === selector ? Buffer.alloc(size, 65) : credential(name)
        supplied.push(item)
        return item
      },
      createComposition: async () => { throw Error('must not run') },
    })
    assert.deepEqual(result, { status: 'CREDENTIAL_UNAVAILABLE', target: 'qdmvngjwkcsilzmqksme' })
    assert.equal(journal.read(), null)
    assert.ok(supplied.every(item => item.every(byte => byte === 0)))
  })
}

test('manifest failure occurs before journal or credential operations', async () => {
  const { journal } = makeJournal()
  await assert.rejects(runHostedBaselineSession({
    journal,
    verifyManifest: async () => { throw Error('stale') },
    readCredential: async () => { throw Error('must not run') },
    createComposition: async () => { throw Error('must not run') },
  }), /stale/)
  assert.equal(journal.read(), null)
})

test('tracked fetch settlement waits for a deferred body read', async () => {
  let resolveRead; let settled = false
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body: { getReader: () => ({
    read: () => new Promise(resolve => { resolveRead = resolve }), cancel: async () => {}, releaseLock: () => {},
  }) } }) })
  const response = await tracked.fetch('https://example.invalid')
  const pendingRead = response.body.getReader().read()
  const waiter = tracked.settle().then(() => { settled = true })
  await Promise.resolve()
  assert.equal(settled, false)
  resolveRead({ done: true })
  await pendingRead; await waiter
  assert.equal(settled, true)
})

test('tracked fetch preserves native WHATWG Response properties while tracking its body', async () => {
  const native = new Response('body', { status: 200, headers: { 'x-tll': 'present' } })
  Object.defineProperty(native, 'url', { configurable: true, value: 'https://api.example.invalid/fixed' })
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => native })
  const response = await tracked.fetch('https://api.example.invalid/fixed')
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-tll'), 'present')
  assert.equal(response.url, 'https://api.example.invalid/fixed')
  const reader = response.body.getReader()
  await reader.read(); await reader.read(); reader.releaseLock()
  await tracked.settle()
})

test('session retains intent until deferred cleanup settles before terminal evidence', async () => {
  const { journal } = makeJournal()
  let release; const cleanup = new Promise(resolve => { release = resolve })
  let entered; const compositionStarted = new Promise(resolve => { entered = resolve })
  const pending = runHostedBaselineSession({
    journal, verifyManifest: async () => {}, readCredential: async selector => credential(selector),
    createComposition: async () => { entered(); return { observe: async () => { throw Error('inert failure') }, dispose: async () => cleanup } },
  })
  await compositionStarted
  assert.equal(journal.read().state, 'INTENT_RECORDED')
  release()
  const result = await pending
  assert.equal(result.status, 'OBSERVATION_FAILED')
  assert.equal(journal.read().state, 'OBSERVATION_FAILED')
})

test('cleanup rejection preserves intent for reconciliation', async () => {
  const { journal } = makeJournal()
  const firstReadFailure = Error('provider payload must not escape')
  firstReadFailure.code = 'provider_read_unavailable'
  const result = await runHostedBaselineSession({
    journal, verifyManifest: async () => {}, readCredential: async selector => credential(selector),
    createComposition: async () => ({ observe: async () => { throw firstReadFailure }, dispose: async () => { throw Error('inert cleanup') } }),
  })
  assert.equal(result.status, 'RECONCILIATION_REQUIRED')
  assert.equal(result.diagnosticReasonCode, 'provider_read_unavailable')
  assert.equal(journal.read().state, 'INTENT_RECORDED')
  assert.doesNotMatch(JSON.stringify(result), /provider payload|inert cleanup/)
})

test('projection rejects numeric and overlong identifiers from an otherwise valid rehashed PASS receipt', () => {
  const base = { schema: 'tll-staging-account-hosted-baseline/v1', target: 'qdmvngjwkcsilzmqksme', status: 'PASS', reasonCodes: [],
    database: { migrations: 15, controlsEnabled: 0, runtimeRoles: 5, runtimeSessions: 0, executionEdges: 0, operatorEdges: 5, receiptHash: 'c'.repeat(64) },
    provider: { name: 'TLL staging subject broker', enabled: false, pkce: true, emailOptional: true, clientId: STAGING_BROKER_PROVIDER.clientId, acceptableClientIds: [], scopes: [...STAGING_BROKER_PROVIDER.scopes], attributeMappingPresent: false, authorizationParamsPresent: false, skipNonceCheck: false, authorizationEndpointMatches: true, tokenEndpointMatches: true, userinfoEndpointMatches: true, jwksConfigured: false, issuerConfigured: false },
    brokerSecrets: { supabasePresent: false, vercelPresent: false }, surface: { edge: false, privateCustomer: false, privateCart: false, publicCustomer: false, publicCart: false },
    vercel: { deploymentId: 'dpl_x', immutableUrl: 'https://x.vercel.app', gitSourceCommit: 'a'.repeat(40), applicationManifestSha256: 'b'.repeat(64), repositoryId: '1', gitProvider: 'github' } }
  const rehash = value => { delete value.observationHash; value.observationHash = createHash('sha256').update(JSON.stringify(value)).digest('hex'); return value }
  assert.doesNotThrow(() => projectHostedBaselineObservation(rehash(structuredClone(base))))
  const numeric = structuredClone(base); numeric.vercel.repositoryId = 1
  assert.throws(() => projectHostedBaselineObservation(rehash(numeric)), /unavailable/)
  const overlongDeployment = structuredClone(base); overlongDeployment.vercel.deploymentId = `dpl_${'x'.repeat(257)}`
  assert.throws(() => projectHostedBaselineObservation(rehash(overlongDeployment)), /unavailable/)
  const overlongRepository = structuredClone(base); overlongRepository.vercel.repositoryId = '1'.repeat(257)
  assert.throws(() => projectHostedBaselineObservation(rehash(overlongRepository)), /unavailable/)
})

test('ordinary read rejection settles without marking cleanup custody uncertain', async () => {
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body: { getReader: () => ({ read: async () => { throw Error('ordinary') }, cancel: async () => {}, releaseLock: () => {} }) } }) })
  const response = await tracked.fetch('https://example.invalid')
  await assert.rejects(response.body.getReader().read())
  await tracked.settle()
})

test('native errored stream read and cancel rejection is terminal, not uncertain cleanup', async () => {
  const body = new ReadableStream({ start (controller) { controller.error(new DOMException('inert', 'AbortError')) } })
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body }) })
  const response = await tracked.fetch('https://example.invalid')
  const reader = response.body.getReader()
  await assert.rejects(reader.read(), /inert/)
  await assert.rejects(reader.cancel(), /inert/)
  reader.releaseLock()
  await assert.doesNotReject(tracked.settle())
})

test('native stream underlying cancellation failure remains uncertain despite closed fulfillment', async () => {
  const body = new ReadableStream({ cancel () { throw Error('inert underlying cancellation') } })
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body }) })
  const response = await tracked.fetch('https://example.invalid')
  const reader = response.body.getReader()
  await assert.rejects(reader.cancel(), /underlying cancellation/)
  reader.releaseLock()
  await assert.rejects(tracked.settle(), /unavailable/)
})

test('cancel rejection without terminal proof remains uncertain after reader release', async () => {
  let rejectClosed
  const closed = new Promise((resolve, reject) => { rejectClosed = reject })
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body: { getReader: () => ({
    closed, read: async () => { throw Error('inert read') }, cancel: async () => { throw Error('inert cancel') },
    releaseLock: () => rejectClosed(Error('lock released')),
  }) } }) })
  const response = await tracked.fetch('https://example.invalid')
  const reader = response.body.getReader()
  await assert.rejects(reader.read(), /inert read/)
  await assert.rejects(reader.cancel(), /inert cancel/)
  reader.releaseLock()
  await assert.rejects(tracked.settle(), /unavailable/)
})

test('rejected body cancellation requires reconciliation', async () => {
  const tracked = createTrackedHostedBaselineFetch({ fetch: async () => ({ body: { getReader: () => ({ read: async () => ({ done: true }), cancel: async () => { throw Error('cancel') }, releaseLock: () => {} }), cancel: async () => { throw Error('cancel') } } }) })
  const response = await tracked.fetch('https://example.invalid')
  await assert.rejects(response.body.cancel())
  await assert.rejects(tracked.settle(), /unavailable/)
})
