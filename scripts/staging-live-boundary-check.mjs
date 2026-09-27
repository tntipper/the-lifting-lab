import { readFileSync, readdirSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function filesBelow(directory) {
  const output = []
  for (const name of readdirSync(directory).sort()) {
    const path = join(directory, name)
    const stat = statSync(path)
    if (stat.isDirectory()) output.push(...filesBelow(path))
    else output.push(path)
  }
  return output
}

const read = path => readFileSync(path, 'utf8')

export function inspectStagingLiveBoundary({ projectRoot = root } = {}) {
  const violations = [], display = path => relative(projectRoot, path)
  const policy = JSON.parse(read(join(projectRoot, 'config/project-stage-gate-policy.json')))
  const required = {
    planningRequiredBeforeExecution: true,
    independentReviewRequiredBeforeArming: true,
    ordinaryTestsRequireAllNativeGatesDisabled: true,
    ordinaryTestsMayInvokeNativeLaunchers: false,
    ordinaryTransportModulesMayDefineLiveLaunchers: false,
    ordinaryTestsMayRewriteGeneratedArtifacts: false,
    armingAndTestExecutionMustBeSeparateProcesses: true,
    liveExecutionRequiresDirectReviewedLauncher: true,
    liveExecutionRequiresPhaseJournal: true,
    incidentRootCauseRequiredBeforeSuccessor: true,
    preventiveControlVerificationRequiredBeforeSuccessor: true,
    failedOrUncertainWindowReplayPermitted: false,
  }
  for (const [name, expected] of Object.entries(required)) if (policy[name] !== expected) violations.push(`policy:${name}`)
  const hold = policy.currentHold ?? {}
  const replayHeld = Array.from({ length: 12 }, (_, index) => index + 10)
    .every(generation => hold[`generation${generation}ReplayPermitted`] === false)
  const armedHeld = Array.from({ length: 11 }, (_, index) => index + 11)
    .every(generation => hold[`generation${generation}Armed`] === false)
  if (!replayHeld || !armedHeld || hold.nextGenerationPermittedBeforeBoundaryReview !== false) {
    violations.push('policy:currentHold')
  }

  for (const path of filesBelow(join(projectRoot, 'tests')).filter(path => /\.(?:mjs|js|ts|tsx)$/.test(path))) {
    const source = read(path)
    if (/runNativeGeneration\d*CredentialWindow\s*\(/.test(source)) violations.push(`test-native-call:${display(path)}`)
    if (/from\s+['"][^'"]*live-launcher[^'"]*['"]/.test(source)) violations.push(`test-live-launcher-import:${display(path)}`)
    if (['tests/staging-provider-keychain-fixture-recovery-launcher.test.mjs',
      'tests/staging-provider-keychain-fixture-recovery-v2-launcher.test.mjs'].includes(display(path))
      && /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/.test(source)) {
      violations.push(`test-fixture-recovery-live-launcher-call:${display(path)}`)
    }
    if (/execFileSync\(process\.execPath,\s*\[\s*['"]scripts\/[^'"]*(?:prepare|recovery|manifest|generate|generator|build)[^'"]*\.mjs['"]\s*\]/.test(source)) violations.push(`test-generated-write:${display(path)}`)
  }

  for (const path of filesBelow(join(projectRoot, 'scripts')).filter(path => /\.(?:mjs|js|ts|py|swift)$/.test(path))) {
    const source = read(path)
    const file = basename(path)
    const exactAssignments = (pattern, expected) => {
      const assignments = source.match(pattern) ?? []
      return assignments.length === 1 && assignments[0] === expected
    }
    if (/^staging-generation-22-.*\.mjs$/.test(file)) {
      const gate = `STAGING_GENERATION_22_${file.slice('staging-generation-22-'.length, -'.mjs'.length).replaceAll('-', '_').toUpperCase()}_ENABLED`
      const expected = [`export const ${gate} = false`]
      if (file === 'staging-generation-22-parent-launcher.mjs') expected.push('export const STAGING_GENERATION_22_PARENT_CLI_ENABLED = false')
      if (file === 'staging-generation-22-worker-entry.mjs') expected.push('export const STAGING_GENERATION_22_WORKER_CLI_ENABLED = false')
      if (file === 'staging-generation-22-incident-recovery.mjs') expected.push('export const STAGING_GENERATION_22_INCIDENT_RECOVERY_CLI_ENABLED = false')
      const assignments = source.match(/^[ \t]*export const STAGING_GENERATION_22_[A-Z0-9_]*ENABLED[ \t]*=.*$/gm) ?? []
      if (assignments.length !== expected.length || assignments.some((line, index) => line !== expected[index])) {
        violations.push(`enabled-native-gate:${display(path)}`)
      }
    }
    if (/^staging-generation-23-.*\.mjs$/.test(file)) {
      const assignments = source.match(/^[ \t]*export const STAGING_GENERATION_23_[A-Z0-9_]*ENABLED[ \t]*=.*$/gm) ?? []
      const expectedCount = file === 'staging-generation-23-worker-entry.mjs' ? 2 : 1
      if (assignments.length !== expectedCount || assignments.some(line => !line.endsWith('= false'))) {
        violations.push(`enabled-native-gate:${display(path)}`)
      }
    }
    if (file === 'staging-generation-22-keychain.py'
      && !exactAssignments(/^[ \t]*GENERATION_22_KEYCHAIN_ENABLED[ \t]*=.*$/gm,
        'GENERATION_22_KEYCHAIN_ENABLED = False')) violations.push(`enabled-keychain-read:${display(path)}`)
    if (file === 'staging-generation-22-credentials.mjs'
      && !exactAssignments(/^[ \t]*export const ACTIVE_WINDOW_EXPIRES_AT[ \t]*=.*$/gm,
        "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'")) violations.push(`armed-expiry:${display(path)}`)
    if (file === 'staging-generation-23-credentials.mjs'
      && !exactAssignments(/^[ \t]*export const ACTIVE_WINDOW_EXPIRES_AT[ \t]*=.*$/gm,
        "export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'")) violations.push(`armed-expiry:${display(path)}`)
    if (file === 'staging-generation-22-recovery-journal.mjs'
      && !exactAssignments(/^[ \t]*export const RECOVERY_WINDOW_EXPIRES_AT[ \t]*=.*$/gm,
        "export const RECOVERY_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'")) violations.push(`armed-expiry:${display(path)}`)
    const sharedReaderGate = {
      'staging-account-hosted-baseline-vercel.mjs': 'HOSTED_BASELINE_VERCEL_BINDING_ENABLED',
      'staging-account-hosted-baseline-supabase.mjs': 'HOSTED_BASELINE_SUPABASE_BINDING_ENABLED',
    }[file]
    if (sharedReaderGate && !exactAssignments(new RegExp(`^[ \\t]*export const ${sharedReaderGate}[ \\t]*=.*$`, 'gm'),
      `export const ${sharedReaderGate} = false`)) violations.push(`enabled-native-gate:${display(path)}`)
    if (!/-live-launcher\.mjs$/.test(path)
      && /\b(?:export\s+)?async\s+function\s+runNativeGeneration\d+CredentialWindow\s*\(/.test(source)) {
      violations.push(`embedded-live-launcher:${display(path)}`)
    }
    if (/-live-launcher\.mjs$/.test(path)
      && !/createStagingWindowPhaseJournal|createProviderNormalizationPhaseJournal|createCredentialReadinessPhaseJournal|createPreviewSourceReadJournal|createPreviewGitPublishJournal|createFixturePhaseJournal|createFixtureRecoveryJournal|createFixtureRecoveryV2Journal|createFixtureMetadataJournal|createSearchDomainJournal|createBrokerRecoveryReadJournal|createStagingProviderBrokerRestJournals|createStagingPreviewDeploymentJournal|createStagingPreviewEnvironmentJournal|createStagingMinimumConfigurationJournal|createStagingGeneration22PreflightJournal|createStagingGeneration23PredecessorJournal/.test(source)) {
      violations.push(`live-launcher-missing-phase-journal:${display(path)}`)
    }
    if (/\bNATIVE(?:_[A-Z0-9]+)*_(?:TRANSPORT_)?ENABLED\s*=\s*true\b/.test(source)
      || /\bHOSTED_BASELINE_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bPROVIDER_NORMALIZATION_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bCREDENTIAL_READINESS_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_NATIVE_READER_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_NATIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_RECOVERY_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_RECOVERY_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_RECOVERY_V2_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_RECOVERY_V2_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bTLL_FIXTURE_METADATA_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\btllMetadataDiagnosticEnabled\s*=\s*true\b/.test(source)
      || /\btllSearchDomainDiagnosticEnabled\s*=\s*true\b/.test(source)
      || /\bTLL_SEARCH_DOMAIN_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_PROVIDER_READONLY_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bPREVIEW_SOURCE_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bBROKER_RECOVERY_READ_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bBROKER_ROTATION_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_BROKER_REST_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_MINIMUM_CONFIGURATION_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_DATABASE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_ACCESS_APPROVED\s*=\s*true\b/.test(source)) violations.push(`enabled-native-gate:${display(path)}`)
    if (path.endsWith('/staging-provider-broker-rest-live-launcher.mjs')) {
      const assignments = source.match(/^[ \t]*export const STAGING_BROKER_REST_LIVE_ENABLED[ \t]*=.*$/gm) ?? []
      const finding = `enabled-native-gate:${display(path)}`
      if ((assignments.length !== 1 || assignments[0] !== 'export const STAGING_BROKER_REST_LIVE_ENABLED = false')
        && !violations.includes(finding)) violations.push(finding)
    }
    if (path.endsWith('/staging-surface-preview-deployment-live-launcher.mjs')) {
      const assignments = source.match(/^[ \t]*export const STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED[ \t]*=.*$/gm) ?? []
      const finding = `enabled-native-gate:${display(path)}`
      if ((assignments.length !== 1 || assignments[0] !== 'export const STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED = false')
        && !violations.includes(finding)) violations.push(finding)
    }
    if (path.endsWith('/staging-preview-environment-live-launcher.mjs')) {
      const assignments = source.match(/^[ \t]*export const STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED[ \t]*=.*$/gm) ?? []
      const finding = `enabled-native-gate:${display(path)}`
      if ((assignments.length !== 1 || assignments[0] !== 'export const STAGING_PREVIEW_ENVIRONMENT_LIVE_ENABLED = false')
        && !violations.includes(finding)) violations.push(finding)
    }
    if (path.endsWith('/staging-minimum-configuration-live-launcher.mjs')) {
      const assignments = source.match(/^[ \t]*export const STAGING_MINIMUM_CONFIGURATION_LIVE_ENABLED[ \t]*=.*$/gm) ?? []
      const finding = `enabled-native-gate:${display(path)}`
      if ((assignments.length !== 1 || assignments[0] !== 'export const STAGING_MINIMUM_CONFIGURATION_LIVE_ENABLED = false')
        && !violations.includes(finding)) violations.push(finding)
    }
    if (/^APPROVED_BROKER_RECOVERY_READ\s*=\s*True\s*$/m.test(source)
      || /^APPROVED_NATIVE_READ\s*=\s*True\s*$/m.test(source)
      || /^APPROVED_PREVIEW_SOURCE_READ\s*=\s*True\s*$/m.test(source)) violations.push(`enabled-keychain-read:${display(path)}`)
    if (path.endsWith('/staging-preview-environment-keychain.py')) {
      const assignments = source.match(/^[ \t]*APPROVED_PREVIEW_ENVIRONMENT_READ[ \t]*=.*$/gm) ?? []
      if (assignments.length !== 1 || assignments[0] !== 'APPROVED_PREVIEW_ENVIRONMENT_READ = False') {
        violations.push(`enabled-keychain-read:${display(path)}`)
      }
    }
    if (path.endsWith('/staging-minimum-configuration-keychain.py')) {
      const assignments = source.match(/^[ \t]*APPROVED_MINIMUM_SUPABASE_READ[ \t]*=.*$/gm) ?? []
      if (assignments.length !== 1 || assignments[0] !== 'APPROVED_MINIMUM_SUPABASE_READ = False') {
        violations.push(`enabled-keychain-read:${display(path)}`)
      }
    }
    if (path.endsWith('/staging-provider-broker-rotation-keychain.py')) {
      const assignments = source.match(/^[ \t]*APPROVED_BROKER_ROTATION[ \t]*=.*$/gm) ?? []
      if (assignments.length !== 1 || assignments[0] !== 'APPROVED_BROKER_ROTATION = False') {
        violations.push(`enabled-keychain-read:${display(path)}`)
      }
    }
    if (path.endsWith('/staging-surface-preview-deployment-keychain.py')) {
      const assignments = source.match(/^[ \t]*APPROVED_PREVIEW_DEPLOYMENT_READ[ \t]*=.*$/gm) ?? []
      if (assignments.length !== 1 || assignments[0] !== 'APPROVED_PREVIEW_DEPLOYMENT_READ = False') {
        violations.push(`enabled-keychain-read:${display(path)}`)
      }
    }
  }
  return Object.freeze(violations.sort())
}

export function assertStagingLiveBoundary(options) {
  const violations = inspectStagingLiveBoundary(options)
  if (violations.length) throw new Error(`Staging live boundary unavailable: ${violations.join(', ')}`)
  return Object.freeze({ status: 'PASS', policy: 'tll-project-stage-gate-policy/v1', violations: 0 })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(assertStagingLiveBoundary())}\n`) }
  catch (error) { process.stderr.write(`${error.message}\n`);process.exitCode = 1 }
}
