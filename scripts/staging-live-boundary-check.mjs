import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
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
    if (display(path) === 'tests/staging-provider-keychain-fixture-recovery-launcher.test.mjs'
      && /\b(?:spawn|spawnSync|execFile|execFileSync)\s*\(/.test(source)) {
      violations.push(`test-fixture-recovery-live-launcher-call:${display(path)}`)
    }
    if (/execFileSync\(process\.execPath,\s*\[\s*['"]scripts\/[^'"]*(?:prepare|recovery|manifest|generate|generator|build)[^'"]*\.mjs['"]\s*\]/.test(source)) violations.push(`test-generated-write:${display(path)}`)
  }

  for (const path of filesBelow(join(projectRoot, 'scripts')).filter(path => /\.(?:mjs|js|ts|py|swift)$/.test(path))) {
    const source = read(path)
    if (!/-live-launcher\.mjs$/.test(path)
      && /\b(?:export\s+)?async\s+function\s+runNativeGeneration\d+CredentialWindow\s*\(/.test(source)) {
      violations.push(`embedded-live-launcher:${display(path)}`)
    }
    if (/-live-launcher\.mjs$/.test(path)
      && !/createStagingWindowPhaseJournal|createProviderNormalizationPhaseJournal|createCredentialReadinessPhaseJournal|createPreviewSourceReadJournal|createPreviewGitPublishJournal|createFixturePhaseJournal|createFixtureRecoveryJournal|createFixtureMetadataJournal/.test(source)) {
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
      || /\bTLL_FIXTURE_METADATA_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\btllMetadataDiagnosticEnabled\s*=\s*true\b/.test(source)
      || /\bSTAGING_PROVIDER_READONLY_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bPREVIEW_SOURCE_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bSTAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_DATABASE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_ACCESS_APPROVED\s*=\s*true\b/.test(source)) violations.push(`enabled-native-gate:${display(path)}`)
    if (/^APPROVED_NATIVE_READ\s*=\s*True\s*$/m.test(source)
      || /^APPROVED_PREVIEW_SOURCE_READ\s*=\s*True\s*$/m.test(source)) violations.push(`enabled-keychain-read:${display(path)}`)
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
