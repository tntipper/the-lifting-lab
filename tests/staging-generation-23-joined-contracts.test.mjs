import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { EDGE_PASSWORD_NAME } from '../scripts/staging-generation-23-password-material.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const encode = value => `data:text/javascript;base64,${Buffer.from(value).toString('base64')}`
const expiresAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 45 * 60_000).toISOString()
const signal = new AbortController().signal
const credentials = () => ({ managementToken: Buffer.from(`sbp_${'a'.repeat(40)}`),
  vercelToken: Buffer.from('vercel-test-token'), previewBypass: Buffer.from('bypass-test-token') })

async function arm(filename, marker, replacement, other = source => source) {
  const source = await readFile(new URL(filename, scripts), 'utf8')
  assert.ok(source.includes(marker), `expected disabled marker in ${filename}`)
  return import(encode(other(source.replace(marker, replacement).replaceAll("from './", `from '${scripts.href}`))))
}

test('hosted password projection, database material and restricted login proof use the same five password texts', async () => {
  const hosted = await arm('staging-generation-23-fixed-hosted-adapters.mjs',
    'STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = false',
    'STAGING_GENERATION_23_FIXED_HOSTED_ADAPTERS_ENABLED = true')
  let projection
  const journalState = { value: null }
  const journal = { claim() {}, dispatch() {}, confirm() {}, hold() {},
    read: () => journalState.value }
  const adapter = hosted.createStagingGeneration23FixedHostedAdapters({
    credentials: credentials(), fetch: async () => assert.fail('network must not run'),
    expiresAt, expectedDeployment: { deploymentId: 'dpl_synthetic', immutableUrl: 'https://synthetic.vercel.app',
      gitSourceCommit: 'a'.repeat(40) }, settingsJournal: journal,
    factories: {
      createInventory: () => ({ readTargets: async () => [{ name: 'synthetic' }], dispose() {} }),
      createEdge: () => ({}), createReplacer: () => ({}),
      createCoordinator: () => ({ async run(input) {
        projection = structuredClone(input.projection)
        journalState.value = { state: 'FINISHED' }
        return { status: 'SETTINGS_REPLACED_UNVERIFIED' }
      } }),
    },
  })
  try {
    assert.equal((await adapter.ports.replaceSettings({ signal })).status, 'SETTINGS_METADATA_VERIFIED')
    const material = adapter.getDatabaseMaterial()
    assert.deepEqual(Object.keys(material.passwords).sort(), [...PASSWORD_PURPOSES].sort())
    assert.deepEqual(Object.keys(material.verifiers).sort(), [...PASSWORD_PURPOSES].sort())
    for (const purpose of PASSWORD_PURPOSES) {
      const hostedValue = projection.vercel[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`]
      assert.match(hostedValue, /^[A-Za-z0-9_-]{64}$/)
      assert.equal(material.passwords[purpose], hostedValue)
      // A SCRAM verifier contains its random salt. Recompute it using that
      // salt to prove it represents the exact password sent to the hosts.
      const verifier = material.verifiers[purpose]
      const salt = Buffer.from(verifier.split('$')[1].split(':')[1], 'base64')
      assert.equal(verifier, deriveScramVerifier(hostedValue, salt))
    }
    assert.equal(projection.supabase[EDGE_PASSWORD_NAME], material.passwords.broker)
    const credentialsSource = (await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8'))
      .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
        `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
      .replaceAll("from './", `from '${scripts.href}`)
    const credentialsUrl = encode(credentialsSource)
    const restricted = await arm('staging-generation-23-restricted-connections.mjs',
      'STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = false',
      'STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = true',
      source => source.replace(`from '${scripts.href}staging-generation-23-credentials.mjs'`,
        `from '${credentialsUrl}'`))
    const accepted = [], diagnosticEvents = []
    const proof = restricted.createStagingGeneration23RestrictedConnections({
      createRuntime: input => ({ pool: { connect() {} }, async close() { accepted.push(input.purpose) } }),
      classifyQueryError: error => error?.code ?? null,
      diagnostic: {
        claim: () => { diagnosticEvents.push('CLAIMED'); return {} },
        progress: (_record, step) => { diagnosticEvents.push(step.step); return {} },
        hold: () => { diagnosticEvents.push('HOLD'); return {} },
        pass: () => { diagnosticEvents.push('PASS'); return {} },
      },
      readCa: () => ({ pem: 'synthetic', sha256: 'a'.repeat(64) }),
      verify: async input => {
        assert.equal(input.requireClassifiedDenials, true)
        assert.equal(typeof input.classifyQueryError, 'function')
        assert.deepEqual(input.passwords, material.passwords)
        for (const purpose of PASSWORD_PURPOSES) input.createRuntime({ purpose, password: input.passwords[purpose] })
        return { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false }
      },
      verifyWrongPassword: async input => {
        assert.notEqual(input.password, material.passwords[input.purpose])
        return { code: '28P01' }
      },
      verifyDrained: async () => ({ status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme',
        purposes: 5, controlsEnabled: false, runtimeSessions: 0 }),
      now: () => Date.parse(expiresAt) - 3 * 60_000,
    })
    assert.equal((await proof.prove({ passwords: material.passwords, expiresAt,
      deadlineAt: new Date(Date.parse(expiresAt) - 60_000).toISOString(), signal })).status, 'PASS_RESTRICTED_CONNECTIONS')
    assert.deepEqual(accepted.sort(), [...PASSWORD_PURPOSES, ...PASSWORD_PURPOSES].sort())
    assert.equal(diagnosticEvents.at(-1), 'PASS')
  } finally { adapter.dispose() }
  assert.throws(() => adapter.getDatabaseMaterial(), /unavailable/)
})

test('backend read receipt projects only the fields accepted by the fixed provider port', async () => {
  const credentialsSource = (await readFile(new URL('staging-generation-23-credentials.mjs', scripts), 'utf8'))
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiresAt}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialsUrl = encode(credentialsSource)
  const backendText = (await readFile(new URL('staging-generation-23-backend-state.mjs', scripts), 'utf8'))
    .replace('STAGING_GENERATION_23_BACKEND_STATE_ENABLED = false',
      'STAGING_GENERATION_23_BACKEND_STATE_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
    .replace(`from '${scripts.href}staging-generation-23-credentials.mjs'`,
      `from '${credentialsUrl}'`)
  const backendUrl = encode(backendText)
  const backend = await import(backendUrl)
  const receipt = { status: 'PASS_BACKEND_OFF', queryId: backend.QUERY_ID,
    projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
    windowId: 'f910c5cb-1a94-410a-8e8d-2c9704c1536a', expiresAt,
    controlsEnabled: false, runtimeSessions: 0 }
  const validated = backend.validateStagingGeneration23BackendState(
    [{ tll_generation_23_backend_state: receipt }], { expiresAt })
  assert.equal(validated.receiptSha256, createHash('sha256').update(JSON.stringify(receipt)).digest('hex'))
  const projected = { projectRef: validated.projectRef, controlsEnabled: validated.controlsEnabled,
    runtimeSessions: validated.runtimeSessions }
  assert.deepEqual(projected, { projectRef: 'qdmvngjwkcsilzmqksme',
    controlsEnabled: false, runtimeSessions: 0 })
  assert.deepEqual(Object.keys(projected).sort(), ['controlsEnabled', 'projectRef', 'runtimeSessions'])
  let observed
  const fixed = await arm('staging-generation-23-fixed-database-provider-components.mjs',
    'STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = false',
    'STAGING_GENERATION_23_FIXED_DATABASE_PROVIDER_COMPONENTS_ENABLED = true',
    source => source.replace(`from '${scripts.href}staging-generation-23-backend-state.mjs'`,
      `from '${backendUrl}'`))
  const bound = fixed.createStagingGeneration23FixedDatabaseProviderComponents({
    credentials: credentials(), sourceCommit: 'a'.repeat(40), expiresAt,
    fetch: async () => assert.fail('network must not run'),
    factories: {
      createSupabase: () => ({ async readProjectSecret() { return Buffer.from('s'.repeat(48)) }, dispose() {} }),
      createProviderJournal: () => ({}),
      createProviderPort: ({ readBackendState }) => ({
        readBackendState, dispose() {},
      }),
      runProvider: async ({ port }) => {
        observed = await port.readBackendState(null, { signal })
        return { status: 'PROVIDER_ENABLED_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', identifier: 'custom:synthetic' }
      },
      postDatabase: async (packet, input) => {
        assert.equal(input.action, 'READ_STATE')
        assert.match(backend.consumeStagingGeneration23BackendStateSql(packet), /^BEGIN READ ONLY;/)
        return [{ tll_generation_23_backend_state: receipt }]
      },
    },
  })
  try {
    assert.equal((await bound.components.providerEnable({ signal, expiresAt })).status, 'PROVIDER_ENABLED_VERIFIED')
    assert.deepEqual(observed, projected)
  } finally { bound.dispose() }
})
