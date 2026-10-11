/** Qualification-only external transport interception; all business/default factories stay actual. */
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../..')
const handoff = JSON.parse(readFileSync(join(root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/source-review.json')))
const trace = event => appendFileSync(join(root, 'qualification-transport-events.jsonl'), `${JSON.stringify({ event, pid: process.pid })}\n`)
const actualSpawn = childProcess.spawn, actualSpawnSync = childProcess.spawnSync
childProcess.spawnSync = (binary, args, options) => {
  const remoteAt = args?.indexOf('ls-remote') ?? -1
  if (remoteAt >= 0) {
    if (args.slice(remoteAt).join('|') !== 'ls-remote|--heads|https://github.com/tntipper/the-lifting-lab.git|refs/heads/codex/tll-integration') throw Error('Unrecognised remote metadata transport')
    trace('git_remote_metadata')
    return { status: 0, signal: null, stdout: Buffer.from(`${handoff.reviewedBaseSha}\trefs/heads/codex/tll-integration\n`) }
  }
  return actualSpawnSync(binary, args, options)
}
childProcess.spawn = (binary, args, options) => {
  if (binary === process.execPath && args.length === 1 && [join(root, 'scripts/staging-owner-successor-worker-entry.mjs'), join(root, 'scripts/staging-owner-successor-cleanup-worker-entry.mjs')].includes(args[0])) {
    trace('supervisor_spawn')
    const child = actualSpawn(binary, ['--import', fileURLToPath(import.meta.url), ...args], options)
    child.stdout.on('data', bytes => trace(`worker_terminal_bytes:${bytes.toString('utf8')}`))
    child.once('exit', (code, signal) => trace(`worker_exit:${code}:${signal}`))
    return child
  }
  if (binary.endsWith('/node_modules/@supabase/cli-darwin-arm64/bin/supabase')) {
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.stdio = [null, child.stdout, child.stderr, new PassThrough()]; child.kill = () => true
    trace('edge_cli_transport')
    child.stdio[3].once('data', async bytes => { const text = bytes.toString(); bytes.fill(0); const { setEdge } = await import('./owner-successor-default-http.mjs'); if (!/^TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED=(?:true|false)\n$/.test(text)) throw Error('Unexpected CLI bytes'); setEdge(text.endsWith('=true\n')); child.emit('close', 0) })
    return child
  }
  if (binary !== '/usr/bin/security' || args[0] !== 'find-generic-password' || args[1] !== '-w') throw Error('Unrecognised process transport')
  const service = args[3], account = args[5]
  const values = { 'Supabase CLI|supabase': `sbp_${'a'.repeat(40)}`,
    'TLL Hosted Baseline Vercel API|prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4': 'synthetic-vercel',
    'TLL Hosted Baseline Preview Bypass|prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4': 'synthetic-bypass' }
  const value = values[`${service}|${account}`]
  if (!value || JSON.stringify(options.stdio) !== JSON.stringify(['ignore', 'pipe', 'ignore'])) throw Error('Credential selector transport mismatch')
  trace(`credential_selector:${service}`)
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => { child.stdout.destroy(); return true }
  queueMicrotask(() => { child.stdout.write(Buffer.from(`${value}\n`)); child.emit('close', 0) })
  return child
}
globalThis.fetch = async url => { trace(`denied_http:${new URL(url).hostname}`); throw Error('Synthetic preflight HTTP failure') }
syncBuiltinESMExports()

try { readFileSync(join(root, 'qualification-config.json')); await import('./owner-successor-default-http.mjs') } catch (error) { if (error?.code !== 'ENOENT') throw error }
