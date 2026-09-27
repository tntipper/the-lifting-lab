/** Opt-in, networkless composite rehearsal. Hosted APIs remain injected. */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23LocalDatabaseFixture } from './staging-generation-23-database-acceptance.mjs'
import { enableStagingSurfaces, freezeStagingSurfaces } from '../scripts/staging-surface-activation-transport.mjs'
import { PROVIDER_IDENTIFIER, STAGING_BROKER_PROVIDER, STAGING_PROVIDER_TARGET,
  STAGING_PROJECT_REF } from '../scripts/staging-provider-broker-rotation.mjs'
import { STAGING_PROVIDER_NAME } from '../scripts/staging-provider-broker-native-adapter.mjs'
import { EDGE_PASSWORD_NAME, PROJECT_REF, VERCEL_PASSWORD_NAMES } from '../scripts/staging-generation-23-password-material.mjs'
import { START, requirements, held, rehearsal, surfaceFixture } from './helpers/staging-generation-23-surface-fixture.mjs'
import { createStagingPreviewDeploymentJournal } from '../scripts/staging-surface-preview-deployment-journal.mjs'
import { createStagingGeneration23PreviewWorkerFixture } from './helpers/staging-generation-23-preview-worker-fixture.mjs'
import { acceptSupervisorPipe } from '../scripts/staging-provider-broker-recovery-process-control.mjs'

const mode = process.argv.slice(2).join(' ')
if (!['--run-offline-once', '--run-supervised-offline-once', '--fail-first-setting-once', '--fail-inventory-branch-once',
  '--fail-surface-public-once', '--fail-owner-verified-once',
  '--fail-setup-reply-once', '--abort-setup-once', '--fail-shutdown-reply-once',
  '--fail-retirement-reply-once'].includes(mode)) {
  throw Error('Explicit local test mode required')
}
const releaseSupervisorPipe = mode === '--run-supervised-offline-once'
  ? await acceptSupervisorPipe({ proof: 'TLL_GEN23_WHOLE_OFFLINE_V1' }) : null

const run = (program, args, env = process.env) => execFileSync(program, args, {
  cwd: new URL('../', import.meta.url), encoding: 'utf8', timeout: 120_000,
  stdio: ['ignore', 'pipe', 'pipe'], env,
})
const surface = surfaceFixture({ losePublicReply: mode === '--fail-surface-public-once' })
const { PHASES, REQUIRED_RESULTS, rehearseStagingGeneration23WholeRun } = await rehearsal()
const scriptDir = new URL('../scripts/', import.meta.url)
async function armedUrl(filename, flag, replacements = []) {
  let source = await readFile(new URL(filename, scriptDir), 'utf8')
  const declaration = `export const ${flag} = false`
  assert.equal(source.split(declaration).length, 2)
  source = source.replace(declaration, `export const ${flag} = true`)
  for (const [from, to] of replacements) source = source.replace(from, to)
  source = source.replaceAll("from './", `from '${scriptDir.href}`)
    .replaceAll('resolve(import.meta.dirname,', `resolve(${JSON.stringify(fileURLToPath(scriptDir))},`)
  return `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
}
const arm = async (filename, flag, replacements = []) =>
  import(await armedUrl(filename, flag, replacements))
const providerControl = await arm('staging-generation-23-provider-control.mjs',
  'STAGING_GENERATION_23_PROVIDER_CONTROL_ENABLED')
const providerPortModule = await arm('staging-generation-23-provider-port.mjs',
  'STAGING_GENERATION_23_PROVIDER_PORT_ENABLED')
const settingsJournalModule = await arm('staging-generation-23-settings-journal.mjs',
  'STAGING_GENERATION_23_SETTINGS_JOURNAL_ENABLED')
const settingsCoordinatorModule = await arm('staging-generation-23-settings-coordinator.mjs',
  'STAGING_GENERATION_23_SETTINGS_COORDINATOR_ENABLED')
const vercelTargetsUrl = await armedUrl('staging-generation-23-vercel-targets.mjs',
  'STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED')
const vercelInventory = await arm('staging-generation-23-vercel-inventory-reader.mjs',
  'STAGING_GENERATION_23_VERCEL_INVENTORY_READER_ENABLED', [[
    "from './staging-generation-23-vercel-targets.mjs'", `from '${vercelTargetsUrl}'`,
  ]])
const vercelReplacer = await arm('staging-generation-23-vercel-replacer.mjs',
  'STAGING_GENERATION_23_VERCEL_REPLACER_ENABLED', [[
    "from './staging-generation-23-vercel-targets.mjs'", `from '${vercelTargetsUrl}'`,
  ]])
const edgeReplacer = await arm('staging-generation-23-edge-replacer.mjs',
  'STAGING_GENERATION_23_EDGE_REPLACER_ENABLED')
const previewBridge = await arm('staging-generation-23-preview-build-port.mjs',
  'STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED')
const database = await createStagingGeneration23LocalDatabaseFixture()
let existingCartFixtureStarted = false
let databaseJournalDirectory, settingsDirectory, providerDirectory, previewDirectory,
  syntheticToken, providerPort
function ensureCartFixture() {
  if (run('docker', ['inspect', '--format', '{{.State.Running}}', 'tll-stage0-postgres']).trim() === 'false') {
    run('docker', ['start', 'tll-stage0-postgres'])
    existingCartFixtureStarted = true
  }
}
try {
const databaseJournalModule = await arm('staging-generation-23-database-journal.mjs',
  'STAGING_GENERATION_23_DATABASE_JOURNAL_ENABLED')
const shutdownUrl = await armedUrl('staging-generation-23-control-shutdown.mjs',
  'STAGING_GENERATION_23_CONTROL_SHUTDOWN_ENABLED', [[
    "from './staging-generation-23-credentials.mjs'", `from '${database.credentialUrl}'`,
  ]])
const shutdownControl = await import(shutdownUrl)
const backendStateUrl = await armedUrl('staging-generation-23-backend-state.mjs',
  'STAGING_GENERATION_23_BACKEND_STATE_ENABLED', [[
    "from './staging-generation-23-credentials.mjs'", `from '${database.credentialUrl}'`,
  ]])
const backendState = await import(backendStateUrl)
const databaseQuery = await arm('staging-generation-23-supabase-query.mjs',
  'STAGING_GENERATION_23_SUPABASE_QUERY_ENABLED', [
    ["from './staging-generation-23-credentials.mjs'", `from '${database.credentialUrl}'`],
    ["from './staging-generation-23-recovery.mjs'", `from '${database.recoveryUrl}'`],
    ["from './staging-generation-23-control-shutdown.mjs'", `from '${shutdownUrl}'`],
    ["from './staging-generation-23-backend-state.mjs'", `from '${backendStateUrl}'`],
  ])
const databaseHostModule = await arm('staging-generation-23-database-host.mjs',
  'STAGING_GENERATION_23_DATABASE_HOST_ENABLED', [
    ["from './staging-generation-23-credentials.mjs'", `from '${database.credentialUrl}'`],
    ["from './staging-generation-23-recovery.mjs'", `from '${database.recoveryUrl}'`],
    ["from './staging-generation-23-control-shutdown.mjs'", `from '${shutdownUrl}'`],
  ])
databaseJournalDirectory = mkdtempSync(join(tmpdir(), 'tll-gen23-composite-database-'))
const databaseJournal = action => databaseJournalModule.createStagingGeneration23DatabaseJournal({
  action, path: join(databaseJournalDirectory, `${action.toLowerCase()}.json`), now: Date.now,
  makeRunId: () => action === 'SETUP' ? '00eec22d-31af-46fd-acf8-af2f15ad54f2'
    : '7f532f58-e750-42f7-9e83-0a7ec82f3732',
})
const setupJournal = databaseJournal('SETUP')
const shutdownJournal = databaseJournal('SHUTDOWN')
const retirementJournal = databaseJournal('RETIRE')
syntheticToken = Buffer.from(`sbp_${'a'.repeat(40)}`)
const httpRequests = []
let parent, surfacePorts
const localRequest = action => (options, callback) => {
  assert.equal(options.hostname, 'api.supabase.com')
  assert.equal(options.path, `/v1/projects/${PROJECT_REF}/database/query`)
  assert.equal(options.method, 'POST')
  assert.equal(options.rejectUnauthorized, true)
  const req = new EventEmitter()
  req.destroyed = false
  req.destroy = () => { req.destroyed = true }
  req.end = body => {
    httpRequests.push(action)
    if (action === 'SETUP' && mode === '--abort-setup-once') parent.abort()
    queueMicrotask(() => {
      if (req.destroyed) return
      try {
        const parsed = JSON.parse(body.toString('utf8'))
        assert.equal(parsed.read_only, false)
        assert.match(parsed.query, action === 'READ_STATE' ? /^BEGIN READ ONLY;/ : /^BEGIN;/)
        let rows
        if (action === 'SETUP') rows = database.executeSetupSql(parsed.query)
        else if (action === 'RETIRE') rows = database.executeRetirementSql(parsed.query)
        else if (action === 'READ_STATE') {
          assert.match(parsed.query, /Gen23 backend controls not OFF/)
          assert.equal(databaseEnabled, false)
          rows = [{ tll_generation_23_backend_state: {
            status: 'PASS_BACKEND_OFF', queryId: backendState.QUERY_ID,
            projectRef: PROJECT_REF, generation: 23,
            windowId: '7d0e8f17-eac4-40e1-a5b5-8a8597d502a9',
            expiresAt: database.expiresAt, controlsEnabled: false,
            runtimeSessions: syntheticSessionCount,
          } }]
        }
        else {
          assert.match(parsed.query, /operator_set_enabled\(false/)
          assert.equal(database.disableControls().status, 'PASS_CONTROLS_DISABLED')
          rows = [{ tll_generation_23_control_shutdown: {
            status: 'PASS_CONTROLS_DISABLED', shutdownId: shutdownControl.SHUTDOWN_ID,
            projectRef: PROJECT_REF, generation: 23,
            windowId: '7d0e8f17-eac4-40e1-a5b5-8a8597d502a9',
            expiresAt: database.expiresAt, controlsEnabled: 0,
          } }]
        }
        if ((action === 'SETUP' && mode === '--fail-setup-reply-once')
          || (action === 'SHUTDOWN' && mode === '--fail-shutdown-reply-once')
          || (action === 'RETIRE' && mode === '--fail-retirement-reply-once')) {
          req.emit('error', Error('injected lost reply after local commit'))
          return
        }
        const res = new EventEmitter()
        res.statusCode = 201
        res.headers = { 'content-type': 'application/json' }
        res.destroy = () => { res.destroyed = true }
        callback(res)
        if (!res.destroyed) {
          res.emit('data', Buffer.from(JSON.stringify(rows)))
          res.emit('end')
        }
      } catch { req.emit('error', Error('local query rejected')) }
    })
  }
  return req
}
const postDatabase = action => (packet, { signal }) =>
  databaseQuery.postStagingGeneration23DatabaseSql(packet, { action,
    token: syntheticToken, signal, request: localRequest(action) })
const setupHost = databaseHostModule.createStagingGeneration23DatabaseHost({
  action: 'SETUP', journal: setupJournal,
  post: postDatabase('SETUP'),
})
const retirementHost = databaseHostModule.createStagingGeneration23DatabaseHost({
  action: 'RETIRE', journal: retirementJournal,
  post: postDatabase('RETIRE'),
})
const shutdownHost = databaseHostModule.createStagingGeneration23DatabaseHost({
  action: 'SHUTDOWN', journal: shutdownJournal,
  post: postDatabase('SHUTDOWN'),
})
settingsDirectory = mkdtempSync(join(tmpdir(), 'tll-gen23-composite-settings-'))
const inventoryTargets = VERCEL_PASSWORD_NAMES.map((name, index) => ({ name,
  id: `env_gen23_${index}`, branch: 'codex/tll-integration', target: 'preview',
  classification: 'sensitive' }))
let settingsTargets
const inventoryReader = vercelInventory.createStagingGeneration23VercelInventoryReader({
  token: Buffer.from('offline-vercel-token'),
  fetch: async (url, options) => {
    assert.match(url, /^https:\/\/api\.vercel\.com\/v10\/projects\//)
    assert.equal(options.method, 'GET')
    return new Response(JSON.stringify({ envs: inventoryTargets.map((target, index) => ({
      id: target.id, key: target.name, target: ['preview'], type: 'sensitive',
      visibility: 'secret', gitBranch: mode === '--fail-inventory-branch-once' && index === 0
        ? 'main' : target.branch,
    })), pagination: { next: null } }), { status: 200,
      headers: { 'content-type': 'application/json' } })
  },
})
const settingsJournal = settingsJournalModule.createStagingGeneration23SettingsJournal({
  path: join(settingsDirectory, 'settings.json'), now: Date.now,
  makeRunId: () => '224f77e4-c361-46ce-b357-1e0a740a7f77',
})
const installedSettings = new Map()
let edgePassword
const vercelFetch = async (url, options) => {
  assert.equal(options.method, 'PATCH')
  const target = settingsTargets.find(item => url.includes(`/env/${item.id}?`))
  assert.ok(target)
  const body = JSON.parse(options.body.toString('utf8'))
  assert.deepEqual(Object.keys(body), ['value'])
  installedSettings.set(target.name, body.value)
  if (mode === '--fail-first-setting-once') throw Error('injected lost setting reply')
  return new Response(JSON.stringify({ id: target.id, key: target.name,
    gitBranch: target.branch, target: ['preview'], type: 'sensitive', visibility: 'secret' }),
  { status: 200, headers: { 'content-type': 'application/json' } })
}
const edgeFetch = async (url, options) => {
  assert.equal(url, `https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets`)
  assert.equal(options.method, 'POST')
  const body = JSON.parse(options.body.toString('utf8'))
  assert.equal(body.length, 1)
  assert.equal(body[0].name, EDGE_PASSWORD_NAME)
  edgePassword = body[0].value
  return new Response('{}', { status: 201, headers: { 'content-type': 'application/json' } })
}
const settingsCoordinator = settingsCoordinatorModule.createStagingGeneration23SettingsCoordinator({
  journal: settingsJournal, now: Date.now,
  makeReplacer: () => vercelReplacer.createStagingGeneration23VercelReplacer({
    token: Buffer.from('offline-vercel-token'), fetch: vercelFetch,
  }),
  edgeHost: edgeReplacer.createStagingGeneration23EdgeReplacer({
    token: Buffer.from('offline-supabase-token'), fetch: edgeFetch,
    expiresAt: database.expiresAt,
  }),
})
let active, databaseEnabled = false, enabledPreview, ownerChecks = false, syntheticSessionCount = 0
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
providerDirectory = mkdtempSync(join(tmpdir(), 'tll-gen23-composite-provider-'))
const providerJournal = action => providerControl.createStagingGeneration23ProviderJournal({
  action, path: join(providerDirectory, `${action.toLowerCase()}.json`),
  makeRunId: () => action === 'ENABLE' ? 'e45d1f62-76cf-4b8d-a27e-0c39af85fe7e'
    : '39e55b60-4858-4b2e-a861-c978d8fe07af', now: () => START,
})
providerPort = providerPortModule.createStagingGeneration23ProviderPort({
  projectSecret: Buffer.from('p'.repeat(48)),
  async readBackendState(target, { signal }) {
    assert.deepEqual(target, STAGING_PROVIDER_TARGET)
    const rows = await postDatabase('READ_STATE')(
      backendState.prepareStagingGeneration23BackendStateSql({ expiresAt: database.expiresAt }),
      { signal })
    const { projectRef, controlsEnabled, runtimeSessions } =
      backendState.validateStagingGeneration23BackendState(rows, { expiresAt: database.expiresAt })
    return { projectRef, controlsEnabled, runtimeSessions }
  },
  async fetcher(url, init) {
    assert.equal(url, `https://${STAGING_PROJECT_REF}.supabase.co/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`)
    if (init.method === 'PUT') {
      const patch = JSON.parse(init.body)
      assert.deepEqual(Object.keys(patch), ['enabled'])
      provider = { ...provider, enabled: patch.enabled,
        updated_at: new Date(START + 1000).toISOString() }
    } else assert.equal(init.method, 'GET')
    return new Response(JSON.stringify(provider), { status: 200,
      headers: { 'content-type': 'application/json' } })
  },
})
const calls = []
const phaseErrors = []
let enabledPreviewJournal, heldPreviewJournal
const operations = Object.fromEntries(PHASES.map(phase => [phase, async ({ signal }) => {
  calls.push(phase)
  try {
  switch (phase) {
    case 'baseline':
      assert.equal(active, undefined)
      assert.equal(databaseEnabled, false)
      assert.equal(provider.enabled, false)
      try { settingsTargets = await inventoryReader.readTargets({ signal }) }
      finally { inventoryReader.dispose() }
      break
    case 'settings':
      const settingResult = await settingsCoordinator.run({ targets: settingsTargets,
        projection: database.passwordProjection(), expiresAt: database.expiresAt,
        signal })
      if (mode === '--fail-first-setting-once') {
        assert.deepEqual(settingResult, { status: 'HOLD_RECONCILE', completedCount: 0 })
        assert.equal(settingsJournal.read().state, 'HOLD')
        return { status: 'HOLD_SETTINGS' }
      }
      assert.deepEqual(settingResult, { status: 'SETTINGS_REPLACED_UNVERIFIED', operationCount: 6 })
      assert.equal(settingsJournal.read().state, 'FINISHED')
      assert.equal(installedSettings.size, 5)
      assert.equal(edgePassword, installedSettings.get(EDGE_PASSWORD_NAME))
      break
    case 'databaseSetup':
      const setupResult = await setupHost.run({ expiresAt: database.expiresAt,
        deadlineAt: database.expiresAt, verifiers: database.verifiers,
        signal })
      if (mode === '--fail-setup-reply-once') {
        assert.equal(setupResult.status, 'HOLD_RECONCILE')
        assert.equal(setupJournal.read().state, 'HOLD')
        return { status: 'HOLD_DATABASE_SETUP' }
      }
      assert.equal(setupResult.status, 'SETUP_VERIFIED')
      assert.equal(setupJournal.read().state, 'FINISHED')
      active = true
      break
    case 'restrictedConnections':
      // The fixture's SCRAM checks use the exact values sent to the injected hosts.
      assert.equal(database.proveRestrictedConnections().runtimeCount, 5)
      break
    case 'providerEnable':
      assert.equal((await providerControl.runStagingGeneration23ProviderControl({ action: 'ENABLE',
        port: providerPort, journal: providerJournal('ENABLE'),
        signal })).status, 'PROVIDER_ENABLED_VERIFIED')
      break
    case 'databaseEnable':
      assert.equal(databaseEnabled, false)
      ensureCartFixture()
      run(process.execPath, ['tests/staging-control-activation-actual.mjs'], {
        ...process.env, TLL_CONTROL_GENERATION: '23',
      })
      assert.equal(database.enableControls().status, 'PASS_CONTROLS_ENABLED')
      databaseEnabled = true
      break
    case 'surfaceEnable': {
      assert.equal(provider.enabled && databaseEnabled, true)
      const result = await enableStagingSurfaces({ ports: surfacePorts, heldEvidence: held,
        requirements, journal: surface.journal('enable'), now: () => START })
      assert.equal(result.status, 'SURFACES_ENABLED_VERIFIED')
      enabledPreview = result.deployment
      break
    }
    case 'ownerJourney':
      assert.ok(enabledPreview)
      run(process.execPath, ['--test', 'tests/customer-auth-mount.test.mjs',
        'tests/customer-orders.test.mjs', 'tests/customer-account-operations.test.mjs'])
      ensureCartFixture()
      run(process.execPath, ['--test', 'tests/staging-cart-account/acceptance.test.mjs'])
      run(process.execPath, ['tests/browser/staging-cart.mjs'], {
        ...process.env, TEST_BROWSER_CHANNEL: 'chrome',
      })
      ownerChecks = true
      syntheticSessionCount = 1
      if (mode === '--fail-owner-verified-once') return { status: 'OWNER_JOURNEY_FAILED_VERIFIED' }
      break
    case 'backendDisable':
      assert.equal(ownerChecks, true)
      const shutdownResult = await shutdownHost.run({ expiresAt: database.expiresAt,
        deadlineAt: database.expiresAt,
        signal })
      if (mode === '--fail-shutdown-reply-once') {
        assert.equal(shutdownResult.status, 'HOLD_RECONCILE')
        assert.equal(shutdownJournal.read().state, 'HOLD')
        return { status: 'HOLD_BACKEND_DISABLE' }
      }
      assert.equal(shutdownResult.status, 'SHUTDOWN_VERIFIED')
      assert.equal(shutdownJournal.read().state, 'FINISHED')
      databaseEnabled = false
      assert.equal((await providerControl.runStagingGeneration23ProviderControl({ action: 'DISABLE',
        port: providerPort, journal: providerJournal('DISABLE'),
        signal })).status, 'PROVIDER_DISABLED_VERIFIED')
      break
    case 'surfaceFreeze': {
      assert.equal(databaseEnabled || provider.enabled, false)
      const result = await freezeStagingSurfaces({ ports: surfacePorts,
        currentEvidence: enabledPreview, requirements,
        journal: surface.journal('freeze'), now: () => START })
      assert.equal(result.status, 'SURFACES_HELD_VERIFIED')
      break
    }
    case 'databaseRetire':
      syntheticSessionCount = 0 // The local browser fixture has now closed its synthetic customer session.
      const retirementResult = await retirementHost.run({ expiresAt: database.expiresAt,
        deadlineAt: database.expiresAt,
        signal })
      if (mode === '--fail-retirement-reply-once') {
        assert.equal(retirementResult.status, 'HOLD_RECONCILE')
        assert.equal(retirementJournal.read().state, 'HOLD')
        return { status: 'HOLD_DATABASE_RETIRE' }
      }
      assert.equal(retirementResult.status, 'RETIREMENT_VERIFIED')
      assert.equal(retirementJournal.read().state, 'FINISHED')
      active = false
      break
    case 'finalReadback':
      assert.equal(database.proveRetired().status, 'PASS_LOCAL_GEN23_DATABASE_LIFECYCLE')
      assert.equal(active || databaseEnabled || provider.enabled, false)
      assert.equal(syntheticSessionCount, 0)
      assert.deepEqual(surface.events, ['edge:true', 'private:true', 'public:true', 'create',
        'edge:false', 'private:false', 'public:false', 'create'])
      assert.deepEqual(httpRequests, ['SETUP', 'READ_STATE', 'SHUTDOWN', 'READ_STATE', 'RETIRE'])
      assert.equal(enabledPreviewJournal.read().phase, 'VERIFIED')
      assert.equal(heldPreviewJournal.read().phase, 'VERIFIED')
      assert.notEqual(enabledPreviewJournal.read().deploymentId, heldPreviewJournal.read().deploymentId)
      break
    default: throw Error('Unrecognised phase')
  }
  return { status: REQUIRED_RESULTS[phase] }
  } catch (error) {
    phaseErrors.push({ phase, message: String(error?.message ?? error).slice(0, 300) })
    throw error
  }
}]))

  parent = new AbortController()
  previewDirectory = mkdtempSync(join(tmpdir(), 'tll-gen23-composite-previews-'))
  const enabledJournal = createStagingPreviewDeploymentJournal({
    path: join(previewDirectory, 'enabled.json'), now: () => START })
  const heldJournal = createStagingPreviewDeploymentJournal({
    path: join(previewDirectory, 'held.json'), now: () => START })
  enabledPreviewJournal = enabledJournal
  heldPreviewJournal = heldJournal
  const previewWorker = createStagingGeneration23PreviewWorkerFixture({ surface, now: START })
  const buildPort = previewBridge.createStagingGeneration23PreviewBuildPort({
    enabledJournal, heldJournal,
    runBuild: previewWorker.runBuild,
    readDeployment: (target, id) => surface.ports.readDeployment(target, id),
  })
  surfacePorts = surface.nativePorts(parent.signal, buildPort)
  const result = await rehearseStagingGeneration23WholeRun({ operations, now: Date.now,
    windowExpiresAt: database.expiresAt, signal: parent.signal })
  if (mode === '--fail-inventory-branch-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'baseline')
    assert.deepEqual(calls, ['baseline'])
    assert.equal(settingsJournal.read(), null)
    assert.equal(httpRequests.length, 0)
    assert.equal(surface.events.length, 0)
    console.log(JSON.stringify({ status: 'PASS_LOCAL_WRONG_BRANCH_STOPS_BEFORE_SETTINGS',
      phaseCount: calls.length, databaseSetup: 'not_dispatched', purchase: 'none' }))
  } else if (mode === '--fail-first-setting-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'settings')
    assert.deepEqual(calls, ['baseline', 'settings'])
    assert.equal(active, undefined)
    assert.equal(provider.enabled, false)
    assert.equal(surface.events.length, 0)
    console.log(JSON.stringify({ status: 'PASS_LOCAL_SETTINGS_LOST_REPLY_STOP',
      phaseCount: calls.length, databaseSetup: 'not_dispatched',
      provider: 'off', surface: 'off', purchase: 'none' }))
  } else if (mode === '--fail-surface-public-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'surfaceEnable')
    assert.deepEqual(calls, PHASES.slice(0, PHASES.indexOf('ownerJourney')))
    assert.equal(provider.enabled && databaseEnabled, true)
    assert.deepEqual(surface.events, ['edge:true', 'private:true', 'public:true'])
    console.log(JSON.stringify({ status: 'PASS_LOCAL_SURFACE_LOST_REPLY_STOP',
      phaseCount: calls.length, customerJourney: 'not_dispatched',
      nextAction: result.nextAction, purchase: 'none' }))
  } else if (mode === '--fail-setup-reply-once' || mode === '--abort-setup-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'databaseSetup')
    assert.deepEqual(calls, ['baseline', 'settings', 'databaseSetup'])
    assert.equal(provider.enabled, false)
    assert.equal(surface.events.length, 0)
    console.log(JSON.stringify({ status: mode === '--abort-setup-once'
      ? 'PASS_LOCAL_PARENT_ABORT_STOPS_SETUP' : 'PASS_LOCAL_SETUP_LOST_REPLY_STOP',
      phaseCount: calls.length, provider: 'off', surface: 'off', purchase: 'none' }))
  } else if (mode === '--fail-retirement-reply-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'databaseRetire', JSON.stringify({ phaseErrors,
      failedPhase: result.failedPhase, nextAction: result.nextAction }))
    assert.deepEqual(calls, PHASES.slice(0, PHASES.indexOf('finalReadback')))
    assert.equal(provider.enabled || databaseEnabled, false)
    assert.equal(surface.events.length, 8)
    console.log(JSON.stringify({ status: 'PASS_LOCAL_RETIREMENT_LOST_REPLY_STOP',
      phaseCount: calls.length, provider: 'off', surface: 'off', purchase: 'none' }))
  } else if (mode === '--fail-shutdown-reply-once') {
    assert.equal(result.status, 'HOLD')
    assert.equal(result.failedPhase, 'backendDisable')
    assert.deepEqual(calls, PHASES.slice(0, PHASES.indexOf('surfaceFreeze')))
    assert.equal(provider.enabled, true)
    assert.equal(surface.events.length, 4)
    console.log(JSON.stringify({ status: 'PASS_LOCAL_SHUTDOWN_LOST_REPLY_STOP',
      phaseCount: calls.length, nextAction: result.nextAction, purchase: 'none' }))
  } else if (mode === '--fail-owner-verified-once') {
    assert.equal(result.status, 'OWNER_JOURNEY_FAILED_SHUTDOWN_VERIFIED')
    assert.equal(result.reason, 'OWNER_JOURNEY_FAILED_VERIFIED')
    assert.deepEqual(calls, PHASES)
    assert.equal(provider.enabled || databaseEnabled, false)
    assert.equal(surface.events.length, 8)
    console.log(JSON.stringify({ status: 'PASS_LOCAL_OWNER_FAILURE_VERIFIED_SHUTDOWN',
      phaseCount: calls.length, provider: 'off', surface: 'off', purchase: 'none' }))
  } else {
  if (result.status !== 'LOCAL_SEQUENCE_PASS') console.error(JSON.stringify({
    status: result.status, failedPhase: result.failedPhase, nextAction: result.nextAction,
  }))
  assert.equal(result.status, 'LOCAL_SEQUENCE_PASS')
  assert.deepEqual(calls, PHASES)
  console.log(JSON.stringify({ status: 'PASS_PARTIAL_LOCAL_COMPOSITE', phaseCount: PHASES.length,
    database: 'real_sql_lifecycle_injected_guarded_host', surface: 'native_adapter_injected_services',
    customer: 'real_local_tests_and_browser', provider: 'real_control_official_sdk_local_fetch',
    backendControls: 'local_fixture_and_gen23_sql_compatibility', settings: 'guarded_transports_local_http',
    previewWorker: 'real_worker_local_http_two_one_use_journals', hostedPreview: 'not_tested',
    purchase: 'none', elapsedMs: result.elapsedMs }))
  }
} finally {
  if (existingCartFixtureStarted) {
    try { run('docker', ['stop', 'tll-stage0-postgres']) } catch { /* preserve primary failure */ }
  }
  database.dispose()
  providerPort?.dispose()
  syntheticToken?.fill(0)
  for (const directory of [previewDirectory, providerDirectory, settingsDirectory, databaseJournalDirectory]) {
    if (directory) rmSync(directory, { recursive: true, force: true })
  }
  releaseSupervisorPipe?.()
}
