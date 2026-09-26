/** Opt-in, networkless composite rehearsal. Hosted provider/settings remain simulated. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23LocalDatabaseFixture } from './staging-generation-23-database-acceptance.mjs'
import { enableStagingSurfaces, freezeStagingSurfaces } from '../scripts/staging-surface-activation-transport.mjs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { START, requirements, held, rehearsal, surfaceFixture } from './helpers/staging-generation-23-surface-fixture.mjs'

if (process.argv.slice(2).join(' ') !== '--run-offline-once') throw Error('Explicit local test mode required')

const run = (program, args, env = process.env) => execFileSync(program, args, {
  cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 120_000,
  stdio: ['ignore', 'pipe', 'pipe'], env,
})
const surface = surfaceFixture()
const { PHASES, REQUIRED_RESULTS, rehearseStagingGeneration23WholeRun } = await rehearsal()
const scriptUrl = new URL('../scripts/staging-generation-23-provider-control.mjs', import.meta.url)
const scriptDir = new URL('../scripts/', import.meta.url)
let providerSource = await readFile(scriptUrl, 'utf8')
assert.equal(providerSource.split('export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = false').length, 2)
providerSource = providerSource.replace('export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = false',
  'export const STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED = true')
  .replaceAll("from './", `from '${scriptDir.href}`)
  .replaceAll('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scriptDir))},`)
const providerControl = await import(`data:text/javascript;base64,${Buffer.from(providerSource).toString('base64')}`)
const database = await createStagingGeneration23LocalDatabaseFixture()
let active, databaseEnabled = false, enabledPreview, ownerChecks = false
let provider = {
  id: 'synthetic-staging-provider', provider_type: 'oauth2', identifier: PROVIDER_IDENTIFIER,
  name: STAGING_PROVIDER_NAME, client_id: STAGING_BROKER_PROVIDER.clientId,
  acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true,
  attribute_mapping: {}, authorization_params: {}, enabled: false, email_optional: true,
  issuer: '', discovery_url: '', skip_nonce_check: false,
  authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl,
  token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl,
  jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null,
  created_at: new Date(START).toISOString(), updated_at: new Date(START).toISOString(),
}
const providerDirectory = mkdtempSync(join(tmpdir(), 'tll-gen23-composite-provider-'))
const providerJournal = action => providerControl.createStagingGeneration23ProviderJournal({
  action, path: join(providerDirectory, `${action.toLowerCase()}.json`),
  makeRunId: () => action === 'ENABLE' ? 'e45d1f62-76cf-4b8d-a27e-0c39af85fe7e'
    : '39e55b60-4858-4b2e-a861-c978d8fe07af', now: () => START,
})
const providerPort = {
  async readBackendState(target) {
    assert.deepEqual(target, STAGING_PROVIDER_TARGET)
    return { projectRef: STAGING_PROJECT_REF, controlsEnabled: databaseEnabled, runtimeSessions: 0 }
  },
  async readProvider(target) { assert.deepEqual(target, STAGING_PROVIDER_TARGET); return { ...provider } },
  async updateProvider(target, identifier, patch) {
    assert.deepEqual(target, STAGING_PROVIDER_TARGET)
    assert.equal(identifier, PROVIDER_IDENTIFIER)
    assert.deepEqual(Object.keys(patch), ['enabled'])
    provider = { ...provider, enabled: patch.enabled,
      updated_at: new Date(START + 1000).toISOString() }
    return { status: 'UPDATED_NEEDS_READBACK', projectRef: STAGING_PROJECT_REF, identifier }
  },
}
let existingCartFixtureStarted = false
const calls = []
const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
  calls.push(phase)
  switch (phase) {
    case 'baseline':
      assert.equal(active, undefined)
      assert.equal(databaseEnabled, false)
      assert.equal(provider.enabled, false)
      break
    case 'settings':
      // The six remote password replacements are exercised separately with
      // injected transports. They cannot run against this networkless Docker.
      break
    case 'databaseSetup':
      assert.equal(database.setup().status, 'PASS')
      active = true
      break
    case 'restrictedConnections':
      assert.equal(database.proveRestrictedConnections().runtimeCount, 5)
      break
    case 'providerEnable':
      assert.equal((await providerControl.runStagingGeneration23ProviderControl({ action: 'ENABLE',
        port: providerPort, journal: providerJournal('ENABLE'),
        signal: new AbortController().signal })).status, 'PROVIDER_ENABLED_VERIFIED')
      break
    case 'databaseEnable':
      assert.equal(databaseEnabled, false)
      assert.equal(database.enableControls().status, 'PASS_CONTROLS_ENABLED')
      databaseEnabled = true
      break
    case 'surfaceEnable': {
      assert.equal(provider.enabled && databaseEnabled, true)
      const result = await enableStagingSurfaces({ ports: surface.ports, heldEvidence: held,
        requirements, journal: surface.journal('enable'), now: () => START })
      assert.equal(result.status, 'SURFACES_ENABLED_VERIFIED')
      enabledPreview = result.deployment
      break
    }
    case 'ownerJourney':
      assert.ok(enabledPreview)
      run(process.execPath, ['--test', 'tests/customer-auth-mount.test.mjs',
        'tests/customer-orders.test.mjs', 'tests/customer-account-operations.test.mjs'])
      if (run('docker', ['inspect', '--format', '{{.State.Running}}', 'tll-stage0-postgres']).trim() === 'false') {
        run('docker', ['start', 'tll-stage0-postgres'])
        existingCartFixtureStarted = true
      }
      run(process.execPath, ['--test', 'tests/staging-cart-account/acceptance.test.mjs'])
      run(process.execPath, ['tests/browser/staging-cart.mjs'], {
        ...process.env, TEST_BROWSER_CHANNEL: 'chrome',
      })
      ownerChecks = true
      break
    case 'backendDisable':
      assert.equal(ownerChecks, true)
      assert.equal(database.disableControls().status, 'PASS_CONTROLS_DISABLED')
      databaseEnabled = false
      assert.equal((await providerControl.runStagingGeneration23ProviderControl({ action: 'DISABLE',
        port: providerPort, journal: providerJournal('DISABLE'),
        signal: new AbortController().signal })).status, 'PROVIDER_DISABLED_VERIFIED')
      break
    case 'surfaceFreeze': {
      assert.equal(databaseEnabled || provider.enabled, false)
      const result = await freezeStagingSurfaces({ ports: surface.ports,
        currentEvidence: enabledPreview, requirements,
        journal: surface.journal('freeze'), now: () => START })
      assert.equal(result.status, 'SURFACES_HELD_VERIFIED')
      break
    }
    case 'databaseRetire':
      assert.equal(database.retire().status, 'PASS_RETIRED')
      active = false
      break
    case 'finalReadback':
      assert.equal(database.proveRetired().status, 'PASS_LOCAL_GEN23_DATABASE_LIFECYCLE')
      assert.equal(active || databaseEnabled || provider.enabled, false)
      assert.deepEqual(surface.events, ['edge:true', 'private:true', 'public:true', 'create',
        'edge:false', 'private:false', 'public:false', 'create'])
      break
    default: throw Error('Unrecognised phase')
  }
  return { status: REQUIRED_RESULTS[phase] }
}]))

try {
  const result = await rehearseStagingGeneration23WholeRun({ operations, now: Date.now,
    windowExpiresAt: database.expiresAt, signal: new AbortController().signal })
  if (result.status !== 'LOCAL_SEQUENCE_PASS') console.error(JSON.stringify({
    status: result.status, failedPhase: result.failedPhase, nextAction: result.nextAction,
  }))
  assert.equal(result.status, 'LOCAL_SEQUENCE_PASS')
  assert.deepEqual(calls, PHASES)
  console.log(JSON.stringify({ status: 'PASS_PARTIAL_LOCAL_COMPOSITE', phaseCount: PHASES.length,
    database: 'real_isolated_postgres', surface: 'real_controller_injected_services',
    customer: 'real_local_tests_and_browser', provider: 'real_control_injected_service',
    backendControls: 'real_local_fixture_only', settings: 'simulated_not_ready',
    hostedPreview: 'not_tested', purchase: 'none', elapsedMs: result.elapsedMs }))
} finally {
  if (existingCartFixtureStarted) {
    try { run('docker', ['stop', 'tll-stage0-postgres']) } catch { /* preserve primary failure */ }
  }
  database.dispose()
}
