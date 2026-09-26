/** Opt-in, networkless composite rehearsal. Hosted provider/settings remain simulated. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createStagingGeneration23LocalDatabaseFixture } from './staging-generation-23-database-acceptance.mjs'
import { enableStagingSurfaces, freezeStagingSurfaces } from '../scripts/staging-surface-activation-transport.mjs'
import { START, requirements, held, rehearsal, surfaceFixture } from './helpers/staging-generation-23-surface-fixture.mjs'

if (process.argv.slice(2).join(' ') !== '--run-offline-once') throw Error('Explicit local test mode required')

const run = (program, args, env = process.env) => execFileSync(program, args, {
  cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 120_000,
  stdio: ['ignore', 'pipe', 'pipe'], env,
})
const surface = surfaceFixture()
const { PHASES, REQUIRED_RESULTS, rehearseStagingGeneration23WholeRun } = await rehearsal()
const database = await createStagingGeneration23LocalDatabaseFixture()
let active, databaseEnabled = false, providerEnabled = false, enabledPreview, ownerChecks = false
let existingCartFixtureStarted = false
const calls = []
const operations = Object.fromEntries(PHASES.map(phase => [phase, async () => {
  calls.push(phase)
  switch (phase) {
    case 'baseline':
      assert.equal(active, undefined)
      assert.equal(databaseEnabled, false)
      assert.equal(providerEnabled, false)
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
      // No Gen23 provider-enable connector exists yet. This state is a local
      // simulation, never evidence that the hosted provider can sign in.
      assert.equal(providerEnabled, false)
      providerEnabled = true
      break
    case 'databaseEnable':
      // The isolated role fixture has no 012-016 customer/cart control tables.
      // A guarded Gen23 backend-control transaction is still required.
      assert.equal(databaseEnabled, false)
      databaseEnabled = true
      break
    case 'surfaceEnable': {
      assert.equal(providerEnabled && databaseEnabled, true)
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
      databaseEnabled = false
      providerEnabled = false
      break
    case 'surfaceFreeze': {
      assert.equal(databaseEnabled || providerEnabled, false)
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
      assert.equal(active || databaseEnabled || providerEnabled, false)
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
    customer: 'real_local_tests_and_browser', provider: 'simulated_not_ready',
    backendControls: 'simulated_not_ready', settings: 'simulated_not_ready',
    hostedPreview: 'not_tested', purchase: 'none', elapsedMs: result.elapsedMs }))
} finally {
  if (existingCartFixtureStarted) {
    try { run('docker', ['stop', 'tll-stage0-postgres']) } catch { /* preserve primary failure */ }
  }
  database.dispose()
}
