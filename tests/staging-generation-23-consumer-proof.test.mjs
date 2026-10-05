import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const script = new URL('../scripts/staging-generation-23-consumer-proof.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_CONSUMER_PROOF_ENABLED = false',
    'export const STAGING_GENERATION_23_CONSUMER_PROOF_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
const sourceCommit = 'a'.repeat(40), manifestSha256 = 'b'.repeat(64)
const signal = new AbortController().signal
const built = Object.freeze({ status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: 'dpl_consumer',
  immutableUrl: 'https://consumer.vercel.app', sourceCommit, manifestSha256,
  customerEnabled: false, cartEnabled: false })
const identity = Object.freeze({ target: STAGING_SURFACE_TARGET, deploymentId: built.deploymentId,
  immutableUrl: built.immutableUrl, sourceCommit, manifestSha256, ready: true,
  createdAt: '2026-09-27T21:00:00.000Z' })
const website = Object.freeze({ status: 'PASS', deploymentId: built.deploymentId,
  checks: Object.freeze({ customer: 'PASS', cart: 'PASS', provisional: 'PASS', bridge: 'PASS' }) })
function connected(overrides = {}) {
  let state = null
  const calls = []
  const proof = armed.createStagingGeneration23ConsumerProof({
    journal: { read: () => state },
    diagnostic: overrides.diagnostic,
    async runBuild({ input }) { calls.push('build'); assert.equal(input.publicCustomer, false)
      state = { phase: 'VERIFIED', deploymentId: built.deploymentId, sourceCommit,
        manifestSha256, publicCustomer: false, publicCart: false }; return overrides.built ?? built },
    async readDeployment() { calls.push('identity'); return overrides.identity ?? identity },
    async readWebsite(_identity, { diagnostic }) { calls.push('website')
      diagnostic?.verified('website_request', 200)
      diagnostic?.pending('website_response_validation')
      return overrides.website ?? website },
    async readEdge({ diagnostic }) { calls.push('edge')
      if (overrides.edgeError) throw overrides.edgeError
      diagnostic?.verified('broker_service_key')
      diagnostic?.pending('broker_request')
      diagnostic?.verified('broker_request', 200)
      diagnostic?.pending('broker_response_validation')
      diagnostic?.verified('broker_response_validation')
      return overrides.edge ?? { status: 'PASS' } },
  })
  return { proof, calls }
}

test('ordinary source remains disabled', async () => {
  const plain = await import(`${script.href}?plain=${Date.now()}`)
  assert.throws(() => plain.createStagingGeneration23ConsumerProof({}), /unavailable/)
})
test('a newly built held Preview and both actual consumers must pass before activation', async () => {
  const { proof, calls } = connected()
  assert.deepEqual(await proof.prove({ sourceCommit, manifestSha256, signal }),
    { status: 'CONSUMERS_READY_VERIFIED', deployment: identity })
  assert.deepEqual(calls, ['build', 'identity', 'website', 'edge'])
  await assert.rejects(proof.prove({ sourceCommit, manifestSha256, signal }), /unavailable/)
})
test('wrong source, website role, or Edge result stops before the next step', async () => {
  for (const altered of [{ built: { ...built, sourceCommit: 'c'.repeat(40) } },
    { website: { ...website, checks: { ...website.checks, bridge: 'FAIL' } } },
    { edge: { status: 'FAIL' } }]) {
    const { proof, calls } = connected(altered)
    await assert.rejects(proof.prove({ sourceCommit, manifestSha256, signal }), /unavailable/)
    assert.equal(calls[0], 'build')
  }
})

test('consumer diagnostic identifies a service-key failure before broker GET', async () => {
  const events = []
  const diagnostic = {
    claim: () => events.push('claim'),
    pending: stage => events.push(`pending:${stage}`),
    verified: stage => events.push(`verified:${stage}`),
    hold: () => events.push('HOLD'),
    finish: () => events.push('PASS'),
  }
  const { proof, calls } = connected({ diagnostic, edgeError: Error('synthetic credential failure') })
  await assert.rejects(proof.prove({ sourceCommit, manifestSha256, signal }), /synthetic/)
  assert.deepEqual(calls, ['build', 'identity', 'website', 'edge'])
  assert.deepEqual(events.slice(-3), ['verified:website_response_validation',
    'pending:broker_service_key', 'HOLD'])
  assert.equal(events.includes('pending:broker_request'), false)
})
