import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

const path = 'scripts/staging-preview-git-publish-live-launcher.mjs'

test('staging publication launcher is disabled before any Git, manifest or journal work', () => {
  const source = readFileSync(path, 'utf8')
  assert.match(source, /export const STAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED = false/)
  assert.match(source, /if \(STAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED !== true\)/)
  assert.match(source, /createPreviewGitPublishJournal\(\)/)
  assert.match(source, /const approved = Object\.freeze\(\{ selectedCommit: '', predecessorCommit: '', manifestSha256: '' \}\)/)
  const body = source.slice(source.indexOf('export async function runStagingPreviewGitPublishLiveOnce()'))
  assert.ok(body.indexOf('if (STAGING_PREVIEW_GIT_PUBLISH_LIVE_ENABLED !== true)')
    < body.indexOf('checkSourceBeforeImport()'))
  assert.ok(body.indexOf('checkSourceBeforeImport()') < body.indexOf('checkCommittedBytes(sourceRoot, sourceCodePaths)'))
  assert.ok(body.indexOf('checkCommittedBytes(sourceRoot, sourceCodePaths)') < body.indexOf('checkManifest(sourceRoot)'))
  assert.ok(body.indexOf('checkCommittedBytes(armRoot, checkerPaths)') < body.indexOf('checkManifest(armRoot)'))
  assert.ok(body.indexOf('checkManifest(armRoot)') < body.indexOf('createPreviewGitPublishJournal()'))

  const result = spawnSync(process.execPath, [path], {
    encoding: 'utf8', timeout: 5_000, env: { PATH: '/usr/bin:/bin', HOME: '/var/empty' },
  })
  assert.equal(result.status, 0)
  assert.equal(result.stderr, '')
  assert.deepEqual(JSON.parse(result.stdout), { status: 'STAGING_PREVIEW_GIT_PUBLISH_LIVE_DISABLED' })
})

test('bootstrap byte proof holds on a concealed modified checker before repository code is run', () => {
  const source = readFileSync(path, 'utf8')
  const definition = source.slice(source.indexOf('function checkCommittedBytes('),
    source.indexOf('\nfunction checkManifest('))
  assert.ok(definition.startsWith('function checkCommittedBytes('))
  const selectedCommit = 'a'.repeat(40)
  const committed = Buffer.from('reviewed checker source\n')
  const concealedLocal = Buffer.from('modified checker source\n')
  let reads = 0
  const proof = runInNewContext(`${definition}\ncheckCommittedBytes`, {
    approved: { selectedCommit },
    sourceGit(args) {
      assert.deepEqual(Array.from(args), ['show', `${selectedCommit}:scripts/checker.mjs`])
      return Buffer.from(committed)
    },
    localBytes() { reads++; return Buffer.from(concealedLocal) },
    unavailable() { throw Error('HOLD') },
  })
  assert.throws(() => proof('/unused', ['scripts/checker.mjs']), /HOLD/)
  assert.equal(reads, 1)
})
