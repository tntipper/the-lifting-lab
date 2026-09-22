import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertStagingLiveBoundary, inspectStagingLiveBoundary } from '../scripts/staging-live-boundary-check.mjs'

const policy = {
  schema: 'tll-project-stage-gate-policy/v1', planningRequiredBeforeExecution: true,
  independentReviewRequiredBeforeArming: true, ordinaryTestsRequireAllNativeGatesDisabled: true,
  ordinaryTestsMayInvokeNativeLaunchers: false, ordinaryTransportModulesMayDefineLiveLaunchers: false,
  ordinaryTestsMayRewriteGeneratedArtifacts: false,
  armingAndTestExecutionMustBeSeparateProcesses: true,
  liveExecutionRequiresDirectReviewedLauncher: true, liveExecutionRequiresPhaseJournal: true,
  incidentRootCauseRequiredBeforeSuccessor: true,
  preventiveControlVerificationRequiredBeforeSuccessor: true, failedOrUncertainWindowReplayPermitted: false,
  currentHold: {
    generation10ReplayPermitted: false, generation11ReplayPermitted: false,
    generation12ReplayPermitted: false, generation13ReplayPermitted: false,
    generation11Armed: false, generation12Armed: false, generation13Armed: false, generation14Armed: false, generation15Armed: false, generation16Armed: false, generation17Armed: false, generation18Armed: false, generation19Armed: false, generation20Armed: false, generation21Armed: false, generation14ReplayPermitted: false, generation15ReplayPermitted: false, generation16ReplayPermitted: false, generation17ReplayPermitted: false, generation18ReplayPermitted: false, generation19ReplayPermitted: false, generation20ReplayPermitted: false, generation21ReplayPermitted: false,
    nextGenerationPermittedBeforeBoundaryReview: false,
  },
}

function fixture({ testSource = '', scriptSource = '' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'tll-live-boundary-'))
  for (const directory of ['config', 'scripts', 'tests']) mkdirSync(join(root, directory))
  writeFileSync(join(root, 'config/project-stage-gate-policy.json'), JSON.stringify(policy))
  writeFileSync(join(root, 'tests/example.test.mjs'), testSource)
  writeFileSync(join(root, 'scripts/example.mjs'), scriptSource)
  return root
}

test('repository ordinary-test boundary passes only while every native gate is disabled', () => {
  assert.deepEqual(assertStagingLiveBoundary(), { status: 'PASS', policy: 'tll-project-stage-gate-policy/v1', violations: 0 })
})

test('boundary rejects a native invocation from an ordinary test', () => {
  const call = ['runNative', 'Generation13CredentialWindow()'].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ testSource: call }) }), ['test-native-call:tests/example.test.mjs'])
})

test('boundary rejects enabled JavaScript and Keychain gates', () => {
  const root = fixture({ scriptSource: 'export const NATIVE_GENERATION_13_TRANSPORT_ENABLED=true\nexport const NATIVE_ACCESS_APPROVED = true\n' })
  writeFileSync(join(root, 'scripts/helper.py'), 'APPROVED_NATIVE_READ = True\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'enabled-keychain-read:scripts/helper.py', 'enabled-native-gate:scripts/example.mjs',
  ])
})

test('boundary rejects an armed database rehearsal launcher', () => {
  const root = fixture()
  writeFileSync(join(root, 'scripts/staging-account-hosted-baseline-db-rehearsal-live-launcher.mjs'),
    'const createStagingWindowPhaseJournal = null\nexport const NATIVE_DB_REHEARSAL_ENABLED = true\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'enabled-native-gate:scripts/staging-account-hosted-baseline-db-rehearsal-live-launcher.mjs',
  ])
})

test('boundary rejects an armed full hosted observer launcher', () => {
  const root = fixture()
  writeFileSync(join(root, 'scripts/staging-account-hosted-baseline-live-launcher.mjs'),
    'const createStagingWindowPhaseJournal = null\nexport const HOSTED_BASELINE_LIVE_ENABLED = true\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'enabled-native-gate:scripts/staging-account-hosted-baseline-live-launcher.mjs',
  ])
})

test('boundary rejects any missing or enabled Generation 10-21 replay hold', () => {
  for (const generation of [10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]) {
    const root = fixture()
    const changed = structuredClone(policy)
    changed.currentHold[`generation${generation}ReplayPermitted`] = true
    writeFileSync(join(root, 'config/project-stage-gate-policy.json'), JSON.stringify(changed))
    assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), ['policy:currentHold'])
  }
})

test('boundary rejects any missing or enabled Generation 11-21 armed hold', () => {
  for (const generation of [11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21]) {
    const root = fixture()
    const changed = structuredClone(policy)
    changed.currentHold[`generation${generation}Armed`] = true
    writeFileSync(join(root, 'config/project-stage-gate-policy.json'), JSON.stringify(changed))
    assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), ['policy:currentHold'])
  }
})

test('boundary rejects an embedded native launcher outside a dedicated live-launcher module', () => {
  const definition = ['export async function runNative', 'Generation13CredentialWindow() {}'].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ scriptSource: definition }) }), [
    'embedded-live-launcher:scripts/example.mjs',
  ])
})

test('boundary rejects a dedicated live launcher without the required phase journal', () => {
  const root = fixture()
  writeFileSync(join(root, 'scripts/staging-generation-13-live-launcher.mjs'), 'export async function launch() {}\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'live-launcher-missing-phase-journal:scripts/staging-generation-13-live-launcher.mjs',
  ])
})

test('boundary rejects an ordinary test that imports the Gen 13 live launcher', () => {
  const importLine = [
    'import { x } ',
    "from '../scripts/staging-generation-13-",
    "live-launcher.mjs'\n",
  ].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ testSource: importLine }) }), [
    'test-live-launcher-import:tests/example.test.mjs',
  ])
})

test('repository Gen 13–19 live launchers are accepted because they use the phase journal', () => {
  for (const generation of [13, 14, 15, 16, 17, 18, 19]) {
    const launcher = `scripts/staging-generation-${generation}-live-launcher.mjs`
    const transport = `scripts/staging-generation-${generation}-transport.mjs`
    const watch = `scripts/staging-generation-${generation}-journal-watch.mjs`
    const source = readFileSync(launcher, 'utf8')
    assert.match(source, /createStagingWindowPhaseJournal/)
    assert.match(source, new RegExp(`export async function runNativeGeneration${generation}CredentialWindow`))
    assert.match(source, /ACTIVE_WITHIN_PHASE_BOUND/)
    assert.match(source, /long-lived process/)
    assert.doesNotMatch(readFileSync(transport, 'utf8'), new RegExp(`runNativeGeneration${generation}CredentialWindow`))
    assert.doesNotMatch(readFileSync(watch, 'utf8'), new RegExp(`runNativeGeneration${generation}CredentialWindow|readSupabaseTokenFromKeychain`))
  }
  assert.deepEqual(assertStagingLiveBoundary(), { status: 'PASS', policy: 'tll-project-stage-gate-policy/v1', violations: 0 })
})

test('boundary rejects an ordinary test that rewrites a generated artifact', () => {
  const writeCall = ['execFileSync(process.execPath, ', "['scripts/example-generator.mjs'])"].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ testSource: writeCall }) }), ['test-generated-write:tests/example.test.mjs'])
})
