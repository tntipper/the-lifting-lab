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
  if (policy.currentHold?.generation10ReplayPermitted !== false
    || policy.currentHold?.generation11ReplayPermitted !== false
    || policy.currentHold?.generation12ReplayPermitted !== false
    || policy.currentHold?.generation13ReplayPermitted !== false
    || policy.currentHold?.generation11Armed !== false
    || policy.currentHold?.generation12Armed !== false
    || policy.currentHold?.generation13Armed !== false
    || policy.currentHold?.generation14Armed !== false
    || policy.currentHold?.nextGenerationPermittedBeforeBoundaryReview !== false) violations.push('policy:currentHold')

  for (const path of filesBelow(join(projectRoot, 'tests')).filter(path => /\.(?:mjs|js|ts|tsx)$/.test(path))) {
    const source = read(path)
    if (/runNativeGeneration\d*CredentialWindow\s*\(/.test(source)) violations.push(`test-native-call:${display(path)}`)
    if (/from\s+['"][^'"]*live-launcher[^'"]*['"]/.test(source)) violations.push(`test-live-launcher-import:${display(path)}`)
    if (/execFileSync\(process\.execPath,\s*\[\s*['"]scripts\/[^'"]*(?:prepare|recovery|manifest|generate|generator|build)[^'"]*\.mjs['"]\s*\]/.test(source)) violations.push(`test-generated-write:${display(path)}`)
  }

  for (const path of filesBelow(join(projectRoot, 'scripts')).filter(path => /\.(?:mjs|js|ts|py)$/.test(path))) {
    const source = read(path)
    if (!/-live-launcher\.mjs$/.test(path)
      && /\b(?:export\s+)?async\s+function\s+runNativeGeneration\d+CredentialWindow\s*\(/.test(source)) {
      violations.push(`embedded-live-launcher:${display(path)}`)
    }
    if (/-live-launcher\.mjs$/.test(path) && !/createStagingWindowPhaseJournal/.test(source)) {
      violations.push(`live-launcher-missing-phase-journal:${display(path)}`)
    }
    if (/\bNATIVE(?:_[A-Z0-9]+)*_(?:TRANSPORT_)?ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_DATABASE_TRANSPORT_ENABLED\s*=\s*true\b/.test(source)
      || /\bNATIVE_ACCESS_APPROVED\s*=\s*true\b/.test(source)) violations.push(`enabled-native-gate:${display(path)}`)
    if (/^APPROVED_NATIVE_READ\s*=\s*True\s*$/m.test(source)) violations.push(`enabled-keychain-read:${display(path)}`)
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
