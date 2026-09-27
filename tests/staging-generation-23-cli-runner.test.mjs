import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { pathToFileURL } from 'node:url'
import { createStagingGeneration23CliRunner, verifyStagingGeneration23CliInstallation } from '../scripts/staging-generation-23-cli-runner.mjs'

const token = value => Buffer.from(value.padEnd(16, 'x'))
const vercelArgs = name => ['--yes', 'vercel', 'env', 'add', name, 'preview', '--git-branch', 'codex/tll-integration', '--no-sensitive', '--force', '--project', 'the-lifting-lab', '--scope', 'my-lifting-lab-s-projects', '--non-interactive', '--no-color']
const supabaseArgs = ['supabase', 'secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', 'qdmvngjwkcsilzmqksme', '--output', 'json']

function child({ closeCode = 0, output = Buffer.alloc(0), delay = 0 } = {}) {
  const value = new EventEmitter()
  value.pid = 1234; value.stdout = new PassThrough(); value.stderr = new PassThrough(); value.stdin = new PassThrough(); value.stdio = [value.stdin, value.stdout, value.stderr, new PassThrough()]
  value.kill = () => value.emit('close', null)
  queueMicrotask(() => { if (output.length) value.stdout.write(output); setTimeout(() => value.emit('close', closeCode), delay) })
  return value
}
async function armedRunner(overrides = {}) {
  const source = readFileSync(new URL('../scripts/staging-generation-23-cli-runner.mjs', import.meta.url), 'utf8')
    .replace('export const STAGING_GENERATION_23_CLI_RUNNER_ENABLED = false', 'export const STAGING_GENERATION_23_CLI_RUNNER_ENABLED = true')
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-cli-runner-'))
  const file = join(directory, 'runner.mjs'); writeFileSync(file, source)
  try {
    const { createStagingGeneration23CliRunner: create } = await import(`${pathToFileURL(file).href}?${Date.now()}`)
    const calls = [], children = []
    const run = create({ vercelToken: token('vercel-token'), managementToken: token('supabase-token'),
      spawnProcess(binary, args, options) { calls.push({ binary, args, options }); const next = child(overrides); children.push(next); return next },
      ...overrides })
    return { run, calls, children }
  } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('ordinary runner remains unavailable', () => {
  assert.throws(() => createStagingGeneration23CliRunner({ vercelToken: token('vercel-token'), managementToken: token('supabase-token') }), /unavailable/)
})

test('accepts only the exact Vercel Preview flag write and passes input on stdin', async () => {
  const value = await armedRunner(), signal = new AbortController().signal
  assert.deepEqual(await value.run(vercelArgs('TLL_STAGING_CUSTOMER_ENABLED'), Buffer.from('true'), 0, { signal }), { status: 'COMPLETED' })
  assert.equal(value.calls.length, 1)
  assert.equal(value.calls[0].binary, '/usr/local/bin/node')
  assert.match(value.calls[0].args[0], /node_modules\/\.bin\/vercel$/)
  assert.deepEqual(value.calls[0].args.slice(1), ['--yes', 'env', 'add', 'TLL_STAGING_CUSTOMER_ENABLED', 'preview', '--git-branch', 'codex/tll-integration', '--no-sensitive', '--force', '--project', 'the-lifting-lab', '--scope', 'my-lifting-lab-s-projects', '--non-interactive', '--no-color'])
  assert.equal(value.calls[0].options.env.VERCEL_TOKEN, 'vercel-tokenxxxx')
  assert.equal(value.calls[0].options.env.SUPABASE_ACCESS_TOKEN, undefined)
  assert.equal(value.calls[0].options.detached, true)
  assert.equal(value.children[0].stdin.read()?.toString(), 'true')
})

test('accepts only the exact Supabase Edge flag write and passes input on fd 3', async () => {
  const value = await armedRunner(), signal = new AbortController().signal
  assert.deepEqual(await value.run(supabaseArgs, Buffer.from('TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED=true\n'), 3, { signal }), { status: 'COMPLETED' })
  assert.equal(value.calls.length, 1)
  assert.match(value.calls[0].binary, /node_modules\/@supabase\/cli-darwin-arm64\/bin\/supabase$/)
  assert.deepEqual(value.calls[0].args, ['secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', 'qdmvngjwkcsilzmqksme', '--output', 'json'])
  assert.equal(value.calls[0].options.env.SUPABASE_ACCESS_TOKEN, 'supabase-tokenxx')
  assert.equal(value.calls[0].options.env.VERCEL_TOKEN, undefined)
  assert.equal(value.children[0].stdio[3].read()?.toString(), 'TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED=true\n')
})

test('rejects arbitrary commands before spawning', async () => {
  const value = await armedRunner(), signal = new AbortController().signal
  await assert.rejects(value.run(['--yes', 'vercel', 'rm'], Buffer.alloc(0), 0, { signal }), /unavailable/)
  assert.equal(value.calls.length, 0)
})

test('rejects wrong input channel and non-flag Supabase input before spawning', async () => {
  const value = await armedRunner(), signal = new AbortController().signal
  await assert.rejects(value.run(supabaseArgs, Buffer.from('OTHER=true\n'), 3, { signal }), /unavailable/)
  await assert.rejects(value.run(vercelArgs('TLL_STAGING_CART_ENABLED'), Buffer.from('true'), 3, { signal }), /unavailable/)
  assert.equal(value.calls.length, 0)
})

test('kills the detached group when the caller aborts or output exceeds its cap', async () => {
  const killed = [], controller = new AbortController()
  const value = await armedRunner({ kill(pid, signal) { killed.push([pid, signal]) }, timeoutMs: 1000 })
  const pending = value.run(vercelArgs('TLL_STAGING_CUSTOMER_ENABLED'), Buffer.from('true'), 0, { signal: controller.signal })
  controller.abort()
  await assert.rejects(pending, /unavailable/)
  assert.deepEqual(killed, [[-1234, 'SIGKILL']])

  const oversized = await armedRunner({ output: Buffer.alloc(17), maxOutputBytes: 16 })
  await assert.rejects(oversized.run(vercelArgs('TLL_STAGING_CART_ENABLED'), Buffer.from('false'), 0, { signal: new AbortController().signal }), /unavailable/)
})

test('local installation proof launches pinned Vercel and native Supabase without credentials', async () => {
  const calls = []
  const result = await verifyStagingGeneration23CliInstallation({
    spawnProcess(binary, args, options) {
      calls.push({ binary, args, options })
      return child()
    },
  })
  assert.deepEqual(result, { status: 'LOCAL_CLI_INSTALLATION_VERIFIED' })
  assert.equal(calls.length, 2)
  for (const call of calls) {
    if (call.binary === '/usr/local/bin/node') {
      assert.match(call.args[0], /node_modules\/\.bin\/vercel$/)
      assert.deepEqual(call.args.slice(1), ['--version'])
    } else {
      assert.match(call.binary, /node_modules\/@supabase\/cli-darwin-arm64\/bin\/supabase$/)
      assert.deepEqual(call.args, ['--version'])
    }
    assert.deepEqual(Object.keys(call.options.env).sort(), ['LANG', 'NO_UPDATE_NOTIFIER', 'PATH'])
    assert.equal(call.options.env.VERCEL_TOKEN, undefined)
    assert.equal(call.options.env.SUPABASE_ACCESS_TOKEN, undefined)
  }
})
