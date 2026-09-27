/**
 * The narrowly scoped CLI bridge for the Generation 23 surface binding.
 *
 * It is intentionally not a general command launcher: only the four named
 * Preview flags and the one staging Edge flag can reach a child process. The
 * caller must supply short-lived tokens; importing this file performs no I/O.
 */
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_GENERATION_23_CLI_RUNNER_ENABLED = true
export const STAGING_GENERATION_23_CLI_RUNNER_TIMEOUT_MS = 45_000
export const STAGING_GENERATION_23_CLI_RUNNER_MAX_OUTPUT_BYTES = 16 * 1024

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
// Vercel's repo-local entrypoint uses `#!/usr/bin/env node`. The supervised
// environment intentionally excludes /usr/local/bin, so execute known Node.
export const STAGING_GENERATION_23_NODE = '/usr/local/bin/node'
const VERCEL = resolve(ROOT, 'node_modules/.bin/vercel')
// The Supabase JavaScript wrapper forwards only fd 0-2 to its native child.
// Use the version-pinned native binary directly so /dev/fd/3 reaches it.
const SUPABASE = resolve(ROOT, 'node_modules/@supabase/cli-darwin-arm64/bin/supabase')
const BRANCH = 'codex/tll-integration'
const PROJECT = 'the-lifting-lab'
const SCOPE = 'my-lifting-lab-s-projects'
const PROJECT_REF = 'qdmvngjwkcsilzmqksme'
const EDGE_FLAG = 'TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'
const unavailable = () => { throw Error('Generation 23 CLI runner unavailable') }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const validSignal = signal => signal && typeof signal.aborted === 'boolean'
  && typeof signal.addEventListener === 'function' && typeof signal.removeEventListener === 'function'
const validToken = token => Buffer.isBuffer(token) && token.length >= 8 && token.length <= 1024
  && !token.includes(0) && /^[\x21-\x7e]+$/.test(token.toString('utf8'))

function classify(args, input, inputFd) {
  if (!Array.isArray(args) || args.some(item => typeof item !== 'string') || !Buffer.isBuffer(input)) unavailable()
  const names = Object.freeze({
    TLL_STAGING_CUSTOMER_ENABLED: ['true', 'false'],
    TLL_STAGING_CART_ENABLED: ['true', 'false'],
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: ['enabled', 'disabled'],
    NEXT_PUBLIC_TLL_STAGING_CART: ['enabled', 'disabled'],
  })
  const name = args[4]
  const expectedVercel = ['--yes', 'vercel', 'env', 'add', name, 'preview', '--git-branch', BRANCH,
    '--no-sensitive', '--force', '--project', PROJECT, '--scope', SCOPE, '--non-interactive', '--no-color']
  if (Object.hasOwn(names, name) && inputFd === 0 && same(args, expectedVercel)
    && names[name].includes(input.toString('utf8'))) {
    return Object.freeze({ binary: STAGING_GENERATION_23_NODE, args: Object.freeze([VERCEL, args[0], ...args.slice(2)]), envName: 'VERCEL_TOKEN', inputFd: 0 })
  }
  const expectedSupabase = ['supabase', 'secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', PROJECT_REF, '--output', 'json']
  if (inputFd === 3 && same(args, expectedSupabase)
    && (input.equals(Buffer.from(`${EDGE_FLAG}=true\n`)) || input.equals(Buffer.from(`${EDGE_FLAG}=false\n`)))) {
    return Object.freeze({ binary: SUPABASE, args: Object.freeze(args.slice(1)), envName: 'SUPABASE_ACCESS_TOKEN', inputFd: 3 })
  }
  unavailable()
}

function cleanEnvironment(name, token) {
  // Both CLIs support these explicit environment variables. Do not inherit a
  // user's shell environment or saved CLI configuration into the supervised run.
  return Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', NO_UPDATE_NOTIFIER: '1', [name]: token.toString('utf8') })
}

function killGroup(child, kill = process.kill) {
  if (!child?.pid || !Number.isSafeInteger(child.pid) || child.pid < 2) return
  try { kill(-child.pid, 'SIGKILL') } catch { try { child.kill('SIGKILL') } catch {} }
}

function runLocalVersion({ script, spawnProcess = spawn, timeoutMs = 10_000,
  maxOutputBytes = 4 * 1024, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout } = {}) {
  if (![VERCEL, SUPABASE].includes(script) || typeof spawnProcess !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30_000
    || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 16 * 1024
    || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  return new Promise((resolveResult, rejectResult) => {
    let child, timer, settled = false, size = 0
    const finish = success => {
      if (settled) return
      settled = true; try { clearScheduledTimeout(timer) } catch {}
      for (const stream of [child?.stdout, child?.stderr]) { try { stream?.destroy?.() } catch {} }
      if (success) resolveResult(true)
      else rejectResult(Error('Generation 23 CLI runner unavailable'))
    }
    const stop = () => { killGroup(child); finish(false) }
    try {
      child = spawnProcess(script === VERCEL ? STAGING_GENERATION_23_NODE : SUPABASE,
        script === VERCEL ? [script, '--version'] : ['--version'], { cwd: ROOT,
        env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', NO_UPDATE_NOTIFIER: '1' }),
        stdio: ['ignore', 'pipe', 'pipe'] })
      if (!child?.stdout || !child?.stderr || typeof child.once !== 'function') unavailable()
    } catch { stop(); return }
    const observe = chunk => {
      if (!Buffer.isBuffer(chunk) || settled) { chunk?.fill?.(0); return }
      size += chunk.length; chunk.fill(0); if (size > maxOutputBytes) stop()
    }
    child.stdout.on('data', observe); child.stderr.on('data', observe)
    child.stdout.once('error', stop); child.stderr.once('error', stop); child.once('error', stop)
    child.once('close', code => finish(code === 0 && size <= maxOutputBytes))
    try { timer = scheduleTimeout(stop, timeoutMs) } catch { stop() }
  })
}

/** Local-only installation proof. It neither reads credentials nor contacts a provider. */
export async function verifyStagingGeneration23CliInstallation(options = {}) {
  await runLocalVersion({ ...options, script: VERCEL })
  await runLocalVersion({ ...options, script: SUPABASE })
  return Object.freeze({ status: 'LOCAL_CLI_INSTALLATION_VERIFIED' })
}

/**
 * Return the exact `runCli(args, bytes, inputFd, { signal })` contract used by
 * createStagingSurfaceNativeBinding. It returns no command output by design.
 */
export function createStagingGeneration23CliRunner({ vercelToken, managementToken,
  spawnProcess = spawn, timeoutMs = STAGING_GENERATION_23_CLI_RUNNER_TIMEOUT_MS,
  maxOutputBytes = STAGING_GENERATION_23_CLI_RUNNER_MAX_OUTPUT_BYTES,
  kill = process.kill, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout } = {}) {
  if (!STAGING_GENERATION_23_CLI_RUNNER_ENABLED || !validToken(vercelToken) || !validToken(managementToken)
    || vercelToken === managementToken || vercelToken.equals(managementToken) || typeof spawnProcess !== 'function'
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000
    || !Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1 || maxOutputBytes > 64 * 1024
    || typeof kill !== 'function' || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  return async (args, input, inputFd, { signal } = {}) => {
    if (!validSignal(signal) || signal.aborted) unavailable()
    const command = classify(args, input, inputFd)
    const token = command.envName === 'VERCEL_TOKEN' ? vercelToken : managementToken
    return new Promise((resolveResult, rejectResult) => {
      let child, timer, settled = false, outputSize = 0
      const finish = success => {
        if (settled) return
        settled = true
        try { clearScheduledTimeout(timer) } catch {}
        signal.removeEventListener('abort', abort)
        for (const stream of [child?.stdout, child?.stderr, child?.stdin, child?.stdio?.[3]]) {
          try { stream?.removeAllListeners?.() } catch {}
          try { stream?.destroy?.() } catch {}
        }
        if (success) resolveResult(Object.freeze({ status: 'COMPLETED' }))
        else rejectResult(Error('Generation 23 CLI runner unavailable'))
      }
      const abort = () => { killGroup(child, kill); finish(false) }
      try {
        child = spawnProcess(command.binary, command.args, { cwd: ROOT, detached: true,
          env: cleanEnvironment(command.envName, token), stdio: [command.inputFd === 0 ? 'pipe' : 'ignore', 'pipe', 'pipe', command.inputFd === 3 ? 'pipe' : 'ignore'] })
        if (!child || typeof child.once !== 'function' || !child.stdout || !child.stderr) unavailable()
      } catch { abort(); return }
      const observe = chunk => {
        if (!Buffer.isBuffer(chunk) || settled) { chunk?.fill?.(0); return }
        outputSize += chunk.length; chunk.fill(0)
        if (outputSize > maxOutputBytes) abort()
      }
      child.stdout.on('data', observe); child.stderr.on('data', observe)
      child.stdout.once('error', abort); child.stderr.once('error', abort); child.once('error', abort)
      child.once('close', code => finish(code === 0 && !signal.aborted && outputSize <= maxOutputBytes))
      signal.addEventListener('abort', abort, { once: true })
      try { timer = scheduleTimeout(abort, timeoutMs) } catch { abort(); return }
      const destination = command.inputFd === 3 ? child.stdio?.[3] : child.stdin
      if (!destination || typeof destination.end !== 'function') { abort(); return }
      destination.once?.('error', abort)
      try { destination.end(input) } catch { abort() }
    })
  }
}
