import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
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
  currentHold: { generation10ReplayPermitted: false, nextGenerationPermittedBeforeBoundaryReview: false },
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
  const call = ['runNative', 'Generation11CredentialWindow()'].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ testSource: call }) }), ['test-native-call:tests/example.test.mjs'])
})

test('boundary rejects enabled JavaScript and Keychain gates', () => {
  const root = fixture({ scriptSource: 'export const NATIVE_GENERATION_11_TRANSPORT_ENABLED=true\nexport const NATIVE_ACCESS_APPROVED = true\n' })
  writeFileSync(join(root, 'scripts/helper.py'), 'APPROVED_NATIVE_READ = True\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'enabled-keychain-read:scripts/helper.py', 'enabled-native-gate:scripts/example.mjs',
  ])
})

test('boundary rejects an embedded native launcher outside a dedicated live-launcher module', () => {
  const definition = ['export async function runNative', 'Generation11CredentialWindow() {}'].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ scriptSource: definition }) }), [
    'embedded-live-launcher:scripts/example.mjs',
  ])
})

test('boundary rejects a dedicated live launcher without the required phase journal', () => {
  const root = fixture()
  writeFileSync(join(root, 'scripts/generation-11-live-launcher.mjs'), 'export async function launch() {}\n')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [
    'live-launcher-missing-phase-journal:scripts/generation-11-live-launcher.mjs',
  ])
})

test('boundary rejects an ordinary test that rewrites a generated artifact', () => {
  const writeCall = ['execFileSync(process.execPath, ', "['scripts/example-generator.mjs'])"].join('')
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: fixture({ testSource: writeCall }) }), ['test-generated-write:tests/example.test.mjs'])
})
