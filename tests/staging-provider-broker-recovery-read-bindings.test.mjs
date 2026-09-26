import test from 'node:test'
import assert from 'node:assert/strict'
import { BROKER_RECOVERY_READ_BINDINGS_ENABLED, BROKER_RECOVERY_PINNED_DEPLOYMENT,
  createBrokerRecoveryReadBindings } from '../scripts/staging-provider-broker-recovery-read-bindings.mjs'
import { BROKER_SECRET_NAME, STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { PREVIEW_READINESS_TARGET } from '../scripts/staging-provider-preview-readiness-session.mjs'

const credentials = () => ({ managementToken: Buffer.from('management-test-only'),
  vercelToken: Buffer.from('vercel-test-only'), protectionBypassToken: Buffer.from('bypass-test-only') })
const make = (override = {}) => {
  const calls = [], tokens = credentials()
  const binding = createBrokerRecoveryReadBindings({ fetch: () => { throw Error('ambient fetch forbidden') }, ...tokens,
    createSupabase: ({ managementToken }) => {
      calls.push('supabase-construct'); assert.equal(managementToken.toString(), 'management-test-only')
      return { target: STAGING_PROJECT_REF, readProvider: () => ({ provider: true }),
        readEdgeSecretNames: () => ['TLL_UNRELATED_STAGING_SECRET', BROKER_SECRET_NAME],
        readDatabase: () => ({ database: true }),
        dispose: () => { calls.push('supabase-dispose') } }
    },
    createVercel: ({ vercelToken }) => {
      calls.push('vercel-construct'); assert.equal(vercelToken.toString(), 'vercel-test-only')
      return { readPreviewEnvironmentPresence: () => ({ branch: PREVIEW_READINESS_TARGET.branch,
        environment: 'preview', brokerSecretPresent: true }), dispose: () => { calls.push('vercel-dispose') } }
    },
    createSurface: ({ expectedDeployment, protectionBypassToken }) => {
      calls.push('surface-construct')
      assert.deepEqual(expectedDeployment, BROKER_RECOVERY_PINNED_DEPLOYMENT)
      assert.equal(protectionBypassToken.toString(), 'bypass-test-only')
      return { readBaseline: () => { calls.push('surface-read'); return override.surface ?? {
        surface: { flags: { privateCustomer: false, privateCart: false, publicCustomer: false,
          publicCart: false }, edge: { enabled: false } },
        deployment: BROKER_RECOVERY_PINNED_DEPLOYMENT,
      } }, dispose: () => { calls.push('surface-dispose') } }
    },
  })
  return { binding, calls, tokens }
}

test('pin is supplied at construction, credentials are wiped, and only read ports are exposed', async () => {
  assert.equal(BROKER_RECOVERY_READ_BINDINGS_ENABLED, false)
  const { binding, calls, tokens } = make()
  for (const value of Object.values(tokens)) assert.ok(value.every(byte => byte === 0))
  assert.deepEqual(Object.keys(binding).sort(), ['dispose', 'readDatabase', 'readPinnedPreview',
    'readProvider', 'readSupabaseNames', 'readVercelNames'])
  const observed = await binding.readPinnedPreview({ expectedDeployment: BROKER_RECOVERY_PINNED_DEPLOYMENT })
  assert.deepEqual(observed.deployment, BROKER_RECOVERY_PINNED_DEPLOYMENT)
  assert.equal(observed.preview.privateCart, false)
  assert.deepEqual(await binding.readSupabaseNames(), [BROKER_SECRET_NAME])
  assert.deepEqual(await binding.readVercelNames(), [BROKER_SECRET_NAME])
  binding.dispose()
  assert.deepEqual(calls, ['supabase-construct', 'vercel-construct', 'surface-construct', 'surface-read',
    'surface-dispose', 'vercel-dispose', 'supabase-dispose'])
  assert.throws(() => binding.readDatabase())
})

test('wrong requested pin is rejected before protected read; changed source is rejected', async () => {
  const first = make()
  await assert.rejects(first.binding.readPinnedPreview({ expectedDeployment: {
    ...BROKER_RECOVERY_PINNED_DEPLOYMENT, gitSourceCommit: 'a'.repeat(40) } }))
  assert.equal(first.calls.includes('surface-read'), false)
  first.binding.dispose()
  const changed = make({ surface: { surface: { flags: { privateCustomer: false, privateCart: false,
    publicCustomer: false, publicCart: false }, edge: { enabled: false } },
  deployment: { ...BROKER_RECOVERY_PINNED_DEPLOYMENT, gitSourceCommit: 'b'.repeat(40) } } })
  await assert.rejects(changed.binding.readPinnedPreview({ expectedDeployment: BROKER_RECOVERY_PINNED_DEPLOYMENT }))
  changed.binding.dispose()
})

test('partial construction failure disposes created bindings and wipes transferred buffers', () => {
  const tokens = credentials(); let disposed = false
  assert.throws(() => createBrokerRecoveryReadBindings({ fetch: () => {}, ...tokens,
    createSupabase: () => ({ dispose: () => { disposed = true } }),
    createVercel: () => { throw Error('construction failed') }, createSurface: () => { throw Error('must not run') },
  }))
  assert.equal(disposed, true)
  for (const value of Object.values(tokens)) assert.ok(value.every(byte => byte === 0))
})
