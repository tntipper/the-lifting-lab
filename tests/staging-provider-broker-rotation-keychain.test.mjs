import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const helper = resolve(import.meta.dirname, '../scripts/staging-provider-broker-rotation-keychain.py')

test('rotation Keychain helper refuses before any selector can be read', () => {
  const source = readFileSync(helper, 'utf8')
  // Guard the subprocess test itself: never execute a newly armed helper.
  assert.match(source, /^APPROVED_BROKER_ROTATION = False$/m)
  assert.match(source, /if not APPROVED_BROKER_ROTATION or sys\.platform != "darwin" or len\(sys\.argv\) != 2:/)
  const result = spawnSync('/usr/bin/python3', ['-I', '-S', helper, 'supabase'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'], timeout: 2_000,
  })
  assert.equal(result.status, 1)
  assert.equal(result.stdout.length, 0)
  result.stdout.fill(0)
})
