import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import {
  assertLongSessionContract,
  LONG_SESSION_ENV,
  KEEPALIVE_PATH_ENV,
  KEEPALIVE_SCHEMA,
} from '../scripts/staging-generation-16-long-session-contract.mjs'
import { NATIVE_GENERATION_16_TRANSPORT_ENABLED } from '../scripts/staging-generation-16-transport.mjs'
import { NATIVE_GENERATION_16_DATABASE_TRANSPORT_ENABLED } from '../scripts/staging-generation-16-database-transport.mjs'
import { assertSupportedOperatorEntry } from '../scripts/staging-generation-16-run-live-once.mjs'

test('generation 16 native gates are disarmed after connection recovery', () => {
  assert.equal(NATIVE_GENERATION_16_TRANSPORT_ENABLED, false)
  assert.equal(NATIVE_GENERATION_16_DATABASE_TRANSPORT_ENABLED, false)
})

test('disabled launcher CLI returns NATIVE_TRANSPORT_DISABLED without long-session env', () => {
  const env = { ...process.env }
  delete env.TLL_LIVE_LONG_SESSION
  delete env.TLL_LIVE_KEEPALIVE_PATH
  const result = spawnSync(
    process.execPath,
    ['scripts/staging-generation-16-live-launcher.mjs'],
    { encoding: 'utf8', env },
  )
  assert.equal(result.status, 0, result.stderr)
  const line = result.stdout.trim().split('\n').at(-1)
  const payload = JSON.parse(line)
  assert.equal(payload.status, 'NATIVE_TRANSPORT_DISABLED')
  assert.equal(payload.generation, 16)
})

test('assertLongSessionContract rejects missing long-session env', () => {
  assert.throws(
    () => assertLongSessionContract({ env: {}, ppid: 42 }),
    error => error?.code === 'LONG_SESSION_CONTRACT_REJECTED',
  )
})

test('assertLongSessionContract rejects missing keepalive path', () => {
  assert.throws(
    () => assertLongSessionContract({
      env: { [LONG_SESSION_ENV]: '1' },
      ppid: 42,
    }),
    error => error?.code === 'LONG_SESSION_CONTRACT_REJECTED',
  )
})

test('assertLongSessionContract rejects orphan ppid', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tll-keepalive-'))
  const path = join(dir, 'keepalive.json')
  writeFileSync(path, JSON.stringify({ schema: KEEPALIVE_SCHEMA, holderPid: 1 }))
  assert.throws(
    () => assertLongSessionContract({
      env: { [LONG_SESSION_ENV]: '1', [KEEPALIVE_PATH_ENV]: path },
      ppid: 1,
    }),
    error => error?.code === 'LONG_SESSION_CONTRACT_REJECTED',
  )
  rmSync(dir, { recursive: true, force: true })
})

test('assertLongSessionContract rejects holderPid mismatch', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tll-keepalive-'))
  const path = join(dir, 'keepalive.json')
  writeFileSync(path, JSON.stringify({ schema: KEEPALIVE_SCHEMA, holderPid: 99 }))
  assert.throws(
    () => assertLongSessionContract({
      env: { [LONG_SESSION_ENV]: '1', [KEEPALIVE_PATH_ENV]: path },
      ppid: 42,
      readParentComm: () => 'bash',
      readParentCmdline: () => 'bash',
    }),
    error => error?.code === 'LONG_SESSION_CONTRACT_REJECTED',
  )
  rmSync(dir, { recursive: true, force: true })
})

test('assertLongSessionContract rejects nohup parent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tll-keepalive-'))
  const path = join(dir, 'keepalive.json')
  writeFileSync(path, JSON.stringify({ schema: KEEPALIVE_SCHEMA, holderPid: 42 }))
  assert.throws(
    () => assertLongSessionContract({
      env: { [LONG_SESSION_ENV]: '1', [KEEPALIVE_PATH_ENV]: path },
      ppid: 42,
      readParentComm: () => 'nohup',
      readParentCmdline: () => 'nohup node launcher.mjs',
    }),
    error => error?.code === 'LONG_SESSION_CONTRACT_REJECTED',
  )
  rmSync(dir, { recursive: true, force: true })
})

test('assertLongSessionContract accepts valid keepalive held by parent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tll-keepalive-'))
  const path = join(dir, 'keepalive.json')
  writeFileSync(path, JSON.stringify({ schema: KEEPALIVE_SCHEMA, holderPid: 42 }))
  const result = assertLongSessionContract({
    env: { [LONG_SESSION_ENV]: '1', [KEEPALIVE_PATH_ENV]: path },
    ppid: 42,
    readParentComm: () => 'node',
    readParentCmdline: () => 'node scripts/staging-generation-16-run-live-once.mjs',
  })
  assert.equal(result.ok, true)
  assert.equal(result.holderPid, 42)
  assert.equal(result.keepalivePath, path)
  rmSync(dir, { recursive: true, force: true })
})

test('run-live-once rejects TLL_ALLOW_NOHUP_LIVE', () => {
  assert.throws(
    () => assertSupportedOperatorEntry({ ppid: 42, env: { TLL_ALLOW_NOHUP_LIVE: '1' } }),
    error => error?.code === 'RUN_LIVE_ONCE_REJECTED',
  )
})

test('run-live-once rejects orphan ppid', () => {
  assert.throws(
    () => assertSupportedOperatorEntry({ ppid: 1, env: {} }),
    error => error?.code === 'RUN_LIVE_ONCE_REJECTED',
  )
})

test('journal-watch supports --follow --interval without importing launcher', () => {
  const source = readFileSync('scripts/staging-generation-16-journal-watch.mjs', 'utf8')
  assert.match(source, /--follow/)
  assert.match(source, /--interval/)
  assert.doesNotMatch(source, /runNativeGeneration16CredentialWindow|readSupabaseTokenFromKeychain/)
})

test('live launcher wires long-session contract before armed journal claim', () => {
  const source = readFileSync('scripts/staging-generation-16-live-launcher.mjs', 'utf8')
  assert.match(source, /assertLongSessionContract/)
  assert.match(source, /staging-generation-16-long-session-contract\.mjs/)
  assert.match(source, /TLL_LIVE_LONG_SESSION/)
  assert.match(source, /gatesArmed\(\)/)
  // Contract is skipped on the disabled path (gates not armed).
  const disabledIdx = source.indexOf('if (!gatesArmed())')
  const contractIdx = source.indexOf('assertLongSession({ env, ppid })')
  assert.ok(disabledIdx > 0 && contractIdx > disabledIdx)
})
