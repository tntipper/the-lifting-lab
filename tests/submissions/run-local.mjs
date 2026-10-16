#!/usr/bin/env node
import { randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { FIXTURE_LABEL, startSubmissionRelay } from './loopback-relay.mjs'

const root = fileURLToPath(new URL('../../', import.meta.url))
const label = FIXTURE_LABEL
export const IMAGES = Object.freeze({ postgres: 'postgres:17-alpine', postgrest: 'postgrest/postgrest:v16.3' })
const password = 'tll-submission-synthetic-only-database'
const jwtSecret = 'tll-submission-synthetic-only-jwt-secret-000000'
const database = 'tll_submission_test'

export function namesFor(id) {
  if (!/^[a-f0-9]{12}$/.test(id)) throw new Error('Invalid synthetic run id')
  return { id, postgres: `tll-submission-ci-postgres-${id}`, postgrest: `tll-submission-ci-postgrest-${id}`, network: `tll-submission-ci-network-${id}` }
}
export function validateArguments(args, platform) {
  if (args.length === 1 && ['--help', '--plan'].includes(args[0])) return args[0]
  if (args.length) throw new Error('Use no arguments, --help, or --plan; custom targets are forbidden')
  if (platform !== 'linux') throw new Error('Run the container suite on Linux Docker; no containers are started on this platform')
  return 'run'
}
export function localEndpoint(value) {
  if (typeof value !== 'string' || !/^unix:\/\/\/[^\r\n\0]+$/.test(value)) throw new Error('A local Unix Docker socket is required; remote contexts are forbidden')
  return value
}
// Capture output so readiness failures and expected rejections are not mistaken
// for passes. Abort/timeout kills the CLI child; cleanup still runs afterward.
function command(binary, args, { input, env = process.env, signal, timeout = 30000, cwd = root } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { cwd, env, signal, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = '', stderr = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), timeout)
    child.stdout.on('data', data => { stdout += data })
    child.stderr.on('data', data => { stderr += data })
    child.on('error', error => { clearTimeout(timer); reject(error) })
    child.on('close', code => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout.trim())
      else { const error = new Error(`${binary} exited unsuccessfully (${code}): ${stderr.slice(-4000)}`); error.stderr = stderr; error.stdout = stdout; reject(error) }
    })
    child.stdin.on('error', () => {})
    child.stdin.end(input)
  })
}
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds))
async function ready(probe, description, { pause = sleep, now = Date.now, signal } = {}) {
  const deadline = now() + 60000
  while (now() < deadline) {
    signal?.throwIfAborted()
    try { if (await probe()) return } catch (error) { if (signal?.aborted) throw error }
    await pause(1000)
  }
  throw new Error(`${description} did not become ready within 60 seconds`)
}

export async function runAcceptance({ execute = command, request = fetch, relayFactory = startSubmissionRelay, pause = sleep, now = Date.now, signal, env = process.env, platform = process.platform, id = randomBytes(6).toString('hex'), log = console.log } = {}) {
  validateArguments([], platform)
  const names = namesFor(id)
  // Inspecting the local context config makes no connection to its endpoint.
  const selected = env.DOCKER_CONTEXT
    ? await execute('docker', ['context', 'inspect', env.DOCKER_CONTEXT, '--format', '{{.Endpoints.docker.Host}}'])
    : env.DOCKER_HOST || await execute('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
  const endpoint = localEndpoint(selected.trim())
  const safeEnv = { ...env, DOCKER_HOST: endpoint }
  delete safeEnv.DOCKER_CONTEXT
  delete safeEnv.DOCKER_TLS_VERIFY
  delete safeEnv.DOCKER_CERT_PATH
  const docker = (args, options = {}) => execute('docker', ['--host', endpoint, ...args], { env: safeEnv, signal, ...options })
  const owned = []
  let originalFailure, relay
  try {
    await docker(['info', '--format', '{{.ServerVersion}}'])
    log('Creating isolated synthetic PostgreSQL 17 and PostgREST 16.3 resources.')
    for (const image of Object.values(IMAGES)) await docker(['pull', image], { timeout: 180000 })
    owned.push(['network', names.network])
    await docker(['network', 'create', '--internal', '--label', `${label}=${id}`, names.network])
    owned.push(['container', names.postgres])
    await docker(['run', '--detach', '--rm', '--name', names.postgres, '--label', `${label}=${id}`, '--network', names.network, '--network-alias', 'postgres', '--memory', '512m', '--cpus', '1', '--tmpfs', '/var/lib/postgresql/data:rw,nosuid', '-e', `POSTGRES_PASSWORD=${password}`, '-e', `POSTGRES_DB=${database}`, IMAGES.postgres], { timeout: 60000 })
    await ready(async () => (await docker(['exec', names.postgres, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', database], { timeout: 5000 })).includes('accepting connections'), 'PostgreSQL', { pause, now, signal })
    const testEnv = { ...safeEnv, TLL_SUBMISSION_TEST_CONTAINER: names.postgres }
    const test = async path => {
      try {
        const output = await execute(process.execPath, ['--experimental-strip-types', '--test', path], { env: testEnv, signal, timeout: 180000 })
        log(output)
      } catch (error) {
        // Node writes test assertions to stdout even when its exit code is 1.
        if (error.stdout) log(String(error.stdout).slice(-16000))
        throw error
      }
    }
    await test('tests/submission-gateway.test.mjs')
    // This suite bootstraps only its synthetic DB and applies F21 once.
    await test('tests/submissions/database.test.mjs')
    log(await execute(process.execPath, ['tests/submissions/verify-replay.mjs'], { env: testEnv, signal, timeout: 60000 }))
    await docker(['exec', '-i', names.postgres, 'psql', '-X', '-q', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], { input: `create role tll_submission_authenticator noinherit login password '${password}'; grant anon,authenticated to tll_submission_authenticator;` })
    owned.push(['container', names.postgrest])
    await docker(['run', '--detach', '--rm', '--name', names.postgrest, '--label', `${label}=${id}`, '--network', names.network, '--memory', '256m', '--cpus', '1', '-e', `PGRST_DB_URI=postgresql://tll_submission_authenticator:${password}@postgres:5432/${database}`, '-e', 'PGRST_DB_SCHEMAS=public', '-e', 'PGRST_DB_ANON_ROLE=anon', '-e', `PGRST_JWT_SECRET=${jwtSecret}`, IMAGES.postgrest], { timeout: 60000 })
    relay = await relayFactory({ runId: id, endpoint, docker, platform, onError: () => log('Task-owned PostgREST relay could not reach its verified container.') })
    testEnv.TLL_SUBMISSION_HTTP_PORT = String(relay.address.port)
    const origin = `http://127.0.0.1:${testEnv.TLL_SUBMISSION_HTTP_PORT}`
    await ready(async () => {
      const response = await request(origin, { signal: AbortSignal.timeout(3000) })
      return response.status === 200 && Boolean((await response.json()).paths?.['/rpc/submit_public_form'])
    }, 'PostgREST schema cache', { pause, now, signal })
    await test('tests/submissions/http.test.mjs')
  } catch (error) { originalFailure = error; throw error }
  finally {
    const cleanupFailures = []
    try { await relay?.close() } catch (error) { cleanupFailures.push(error) }
    for (const [kind, name] of owned.reverse()) {
      try {
        let resourceLabel
        try { resourceLabel = await docker([kind, 'inspect', name, '--format', kind === 'container' ? `{{index .Config.Labels "${label}"}}` : `{{index .Labels "${label}"}}`], { signal: undefined, timeout: 10000 }) }
        catch (error) {
          if (/No such (?:container|network|object)/i.test(String(error.stderr))) continue
          throw error
        }
        if (resourceLabel !== id) throw new Error(`Refusing cleanup: ownership label mismatch on ${name}`)
        await docker(kind === 'container' ? ['container', 'rm', '--force', '--volumes', name] : ['network', 'rm', name], { signal: undefined, timeout: 15000 })
      } catch (error) { cleanupFailures.push(error) }
    }
    if (cleanupFailures.length) {
      const cleanupError = new AggregateError(cleanupFailures, 'Some task-owned synthetic resources could not be removed')
      if (originalFailure) log(cleanupError.message + ': ' + cleanupFailures.map(error => error.message).join('; '))
      else throw cleanupError
    }
  }
  log('PASS: submission SQL, guarded migration replay, HTTP acceptance and owned cleanup complete.')
}

async function main() {
  const mode = validateArguments(process.argv.slice(2), process.platform)
  if (mode !== 'run') {
    console.log(mode === '--help' ? 'Usage: node tests/submissions/run-local.mjs [--help|--plan]\nRuns only on Linux Docker. No custom services, credentials or targets are accepted.' : JSON.stringify({ images: IMAGES, database, network: 'generated, isolated, no external egress', postgresPublishedPorts: [], apiRelay: '127.0.0.1:<ephemeral> to verified task-container IP:3000', phases: ['unit', 'SQL bootstrap + one-time migration', 'rejected replay + unchanged dumps', 'HTTP', 'owned resource cleanup'] }, null, 2))
    return
  }
  const controller = new AbortController()
  const cancel = () => controller.abort(new Error('Submission acceptance interrupted'))
  process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
  try { await runAcceptance({ signal: controller.signal }) }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel) }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => { console.error(error.message); process.exitCode = 1 })
