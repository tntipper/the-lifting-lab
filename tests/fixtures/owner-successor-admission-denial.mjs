/** Credential-free test transport. Never installed by a native launch path. */
import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { appendFileSync, readFileSync, linkSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(import.meta.dirname, '../..')
const handoffPath = join(root, '.agent/owner-successor/cd4130c8-a8b8-462b-bdbe-5c3e6250a02d/source-review.json')
const handoff = JSON.parse(readFileSync(handoffPath))
const config = JSON.parse(readFileSync(join(root, 'qualification-admission-case.json')))
const trace = event => appendFileSync(join(root, 'qualification-admission-events.jsonl'), `${JSON.stringify({ event, pid: process.pid })}\n`)
const actualSpawn = childProcess.spawn, actualSpawnSync = childProcess.spawnSync
if (process.argv[1] === join(root, 'scripts/staging-owner-successor-worker-entry.mjs')) {
  trace('real_child_started')
  for (const [index, path] of [join(root, 'config/staging-owner-successor-source-policy.json'), handoffPath].entries())
    linkSync(path, join(root, `.child-stress-${process.pid}-${index}`))
  trace('child_links_injected')
}
if (config.expired) Date.now = () => config.expiredAt
childProcess.spawnSync = (binary, args, options) => {
  const at = args?.indexOf('ls-remote') ?? -1
  if (at >= 0) {
    if (args.slice(at).join('|') !== 'ls-remote|--heads|https://github.com/tntipper/the-lifting-lab.git|refs/heads/codex/tll-integration') throw Error('Unexpected metadata transport')
    trace('synthetic_remote_metadata_only')
    return { status: 0, signal: null, stdout: Buffer.from(`${handoff.reviewedBaseSha}\trefs/heads/codex/tll-integration\n`) }
  }
  if (!binary.endsWith('/git') && binary !== '/usr/bin/codesign') { trace('unexpected_sync_transport_denied'); throw Error('Unexpected process denied') }
  return actualSpawnSync(binary, args, options)
}
childProcess.spawn = (binary, args, options) => {
  if (binary === process.execPath && args.length === 1 && args[0] === join(root, 'scripts/staging-owner-successor-worker-entry.mjs')) {
    trace('fixed_supervisor_spawn')
    return actualSpawn(binary, ['--import', fileURLToPath(import.meta.url), ...args], options)
  }
  if (binary === '/usr/bin/security') {
    trace('credential_boundary_denied')
    const child = new EventEmitter(); child.stdout = new PassThrough(); child.kill = () => true
    queueMicrotask(() => child.emit('close', 1))
    return child
  }
  trace('external_process_denied'); throw Error('External process denied')
}
globalThis.fetch = async () => { trace('hosted_fetch_denied'); throw Error('Hosted access denied') }
syncBuiltinESMExports()
