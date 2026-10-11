import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import { chmodSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { readPinnedV2Baseline, validV2BaselinePayload } from '../scripts/staging-provider-keychain-fixture-recovery-v2-baseline.mjs'

const login = resolve(homedir(), 'Library/Keychains/login.keychain-db')
const expected = { runId: '12345678-1234-1234-1234-123456789abc',
  sourceSha256: 'a'.repeat(64), binarySha256: 'b'.repeat(64) }
const loginEntry = { path: login, device: '1', inode: '2' }
const extra = { path: '/synthetic/common.keychain-db', device: '1', inode: '3' }
const payload = () => ({ schema: 'tll-stage3-fixture-recovery-baseline/v2', ...expected,
  domain: 'USER', defaultPath: login, effectiveSearch: [loginEntry, extra],
  userSearch: [loginEntry] })

function fixture(body) {
  const directory = mkdtempSync(join(tmpdir(), 'tll-recovery-v2-baseline-'))
  chmodSync(directory, 0o700)
  const path = join(directory, 'baseline.json')
  try { body({ directory, path, write: value => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
    writeFileSync(path, bytes, { mode: 0o600 })
    return createHash('sha256').update(bytes).digest('hex')
  } }) } finally { rmSync(directory, { recursive: true, force: true }) }
}

test('V2 accepts a private full two-entry baseline and binds its exact bytes', () => fixture(({ path, write }) => {
  const digest = write(payload())
  assert.deepEqual(readPinnedV2Baseline({ path, expected, digest }),
    { sha256: digest, effectiveCount: 2 })
  assert.throws(() => readPinnedV2Baseline({ path, expected, digest: 'c'.repeat(64) }))
}))

test('V2 rejects aliases, fixture entries, changed owner identity and changed list order', () => {
  for (const change of [
    value => { value.userSearch = [extra] },
    value => { value.effectiveSearch.push({ path: '/login-alias', device: '1', inode: '2' }) },
    value => { value.effectiveSearch.push({ path: '/fixture', device: '16777234', inode: '144003379' }) },
    value => { value.effectiveSearch.push({ path: '/sidecar', device: '16777234', inode: '144003377' }) },
    value => { value.effectiveSearch.push(extra) },
    value => { value.domain = 'SYSTEM' },
    value => { value.runId = 'ffffffff-ffff-ffff-ffff-ffffffffffff' },
    value => { value.binarySha256 = 'd'.repeat(64) },
    value => { value.effectiveSearch[1] = { ...extra, device: '2147483648' } },
    value => { value.effectiveSearch[1] = { ...extra, inode: '18446744073709551616' } },
    value => { value.effectiveSearch[1] = { ...extra, path: `/${'é'.repeat(2050)}` } },
  ]) {
    const candidate = payload(); change(candidate)
    assert.equal(validV2BaselinePayload(candidate, expected), false)
  }
  fixture(({ path, write }) => {
    const digest = write(payload())
    const reordered = payload(); reordered.effectiveSearch.reverse()
    write(reordered)
    assert.throws(() => readPinnedV2Baseline({ path, expected, digest }))
  })
})

test('V2 refuses a permissive or symlinked baseline file', () => fixture(({ directory, path, write }) => {
  write(payload())
  chmodSync(path, 0o644)
  assert.throws(() => readPinnedV2Baseline({ path, expected }))
  rmSync(path)
  symlinkSync(join(directory, 'missing'), path)
  assert.throws(() => readPinnedV2Baseline({ path, expected }))
}))
