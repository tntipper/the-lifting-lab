import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createStagingPreviewGitPublishCoordinator, STAGING_PREVIEW_GIT_PUBLISH_NATIVE_ENABLED } from '../scripts/staging-preview-git-publish-coordinator.mjs'
import { createPreviewGitPublishJournal } from '../scripts/staging-preview-git-publish-journal.mjs'

const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40), manifestSha256 = 'c'.repeat(64)
const selection = Object.freeze({ selectedCommit, predecessorCommit, manifestSha256 })
const runId = '12345678-1234-4234-8234-123456789abc'
const HOLD = { status: 'SOURCE_PUBLICATION_HOLD' }
async function withWindow(fn, fileSystem = fs) {
  const directory = fs.mkdtempSync(resolve(tmpdir(), 'tll-publish-window-'))
  const path = resolve(directory, 'private', 'intent.json')
  const journal = createPreviewGitPublishJournal({ path, fileSystem, makeRunId: () => runId,
    now: () => Date.parse('2026-09-24T12:00:00.000Z') })
  try { return await fn({ path, journal }) } finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

test('one durable dispatch precedes one push and a selected remote yields only Preview-unverified receipt', async () => {
  assert.equal(STAGING_PREVIEW_GIT_PUBLISH_NATIVE_ENABLED, false)
  await withWindow(async ({ journal }) => {
    const events = []
    const coordinator = createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async phase => { events.push(`read:${phase}`); return phase === 'before' ? predecessorCommit : selectedCommit },
      push: async value => {
        events.push('push')
        assert.deepEqual(value, selection)
        assert.equal(Object.isFrozen(value), true)
        assert.equal(journal.read().phase, 'DISPATCH_RECORDED')
      },
    })
    const result = await coordinator.execute(selection)
    assert.deepEqual(result, { status: 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED', sourceCommit: selectedCommit, manifestSha256 })
    assert.deepEqual(events, ['read:before', 'push', 'read:after'])
    assert.equal(journal.read().outcome, 'REMOTE_SELECTED')
    assert.deepEqual(await coordinator.execute(selection), HOLD)
    assert.equal(events.filter(value => value === 'push').length, 1)
  })
})

test('remote drift, malformed selection and getter fields stop before journal and push', async () => {
  for (const candidate of [
    { ...selection, selectedCommit: 'short' }, { ...selection, manifestSha256: [manifestSha256] },
    { ...selection, extra: true }, [selection],
  ]) await withWindow(async ({ path, journal }) => {
    let pushed = 0
    const result = await createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async () => predecessorCommit, push: async () => { pushed++ },
    }).execute(candidate)
    assert.deepEqual(result, HOLD); assert.equal(pushed, 0); assert.equal(fs.existsSync(path), false)
  })
  await withWindow(async ({ path, journal }) => {
    let reads = 0
    const candidate = { ...selection }
    Object.defineProperty(candidate, 'selectedCommit', { enumerable: true, get() { reads++; return selectedCommit } })
    assert.deepEqual(await createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }), readRemote: async () => predecessorCommit,
      push: async () => assert.fail('no push') }).execute(candidate), HOLD)
    assert.equal(reads, 0); assert.equal(fs.existsSync(path), false)
  })
  await withWindow(async ({ path, journal }) => {
    let pushed = 0
    assert.deepEqual(await createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async () => 'd'.repeat(40), push: async () => { pushed++ },
    }).execute(selection), HOLD)
    assert.equal(pushed, 0); assert.equal(fs.existsSync(path), false)
  })
})

test('fresh source, predecessor and manifest must still match immediately before dispatch', async () => {
  for (const fresh of [
    undefined,
    { status: 'PUBLISH_SOURCE_HOLD' },
    { status: 'PUBLISH_SOURCE_SELECTED', ...selection, selectedCommit: 'd'.repeat(40) },
    { status: 'PUBLISH_SOURCE_SELECTED', ...selection, predecessorCommit: 'd'.repeat(40) },
    { status: 'PUBLISH_SOURCE_SELECTED', ...selection, manifestSha256: 'd'.repeat(64) },
    { status: 'PUBLISH_SOURCE_SELECTED', ...selection, extra: 'unexpected' },
  ]) await withWindow(async ({ path, journal }) => {
    let pushed = 0
    const coordinator = createStagingPreviewGitPublishCoordinator({ journal,
      readRemote: async () => predecessorCommit, recheckSource: async () => fresh,
      push: async () => { pushed++ },
    })
    assert.deepEqual(await coordinator.execute(selection), HOLD)
    assert.deepEqual(await coordinator.execute(selection), HOLD)
    assert.equal(pushed, 0)
    assert.equal(fs.existsSync(path), false)
  })
  await withWindow(async ({ path, journal }) => {
    let statusReads = 0
    const fresh = { ...selection }
    Object.defineProperty(fresh, 'status', { get() { statusReads++; return 'PUBLISH_SOURCE_SELECTED' } })
    assert.deepEqual(await createStagingPreviewGitPublishCoordinator({ journal,
      readRemote: async () => predecessorCommit, recheckSource: async () => fresh,
      push: async () => assert.fail('no push'),
    }).execute(selection), HOLD)
    assert.equal(statusReads, 0)
    assert.equal(fs.existsSync(path), false)
  })
})

test('missing or failed fresh source port consumes the coordinator without creating a journal', async () => {
  for (const port of [undefined, async () => { throw Error('source unavailable') }]) {
    await withWindow(async ({ path, journal }) => {
      const coordinator = createStagingPreviewGitPublishCoordinator({ journal,
        readRemote: async () => predecessorCommit, recheckSource: port,
        push: async () => assert.fail('no push'),
      })
      assert.deepEqual(await coordinator.execute(selection), HOLD)
      assert.deepEqual(await coordinator.execute(selection), HOLD)
      assert.equal(fs.existsSync(path), false)
    })
  }
})

test('uncertain push acknowledgement reconciles once, never retries and preserves terminal outcome', async () => {
  for (const after of [selectedCommit, predecessorCommit, undefined]) await withWindow(async ({ journal }) => {
    let pushes = 0, reads = 0
    const result = await createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async phase => { reads++; if (phase === 'before') return predecessorCommit; if (after === undefined) throw Error('read failed'); return after },
      push: async () => { pushes++; throw Error('acknowledgement unknown') },
    }).execute(selection)
    assert.equal(pushes, 1); assert.equal(reads, 2)
    assert.deepEqual(result, after === selectedCommit
      ? { status: 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED', sourceCommit: selectedCommit, manifestSha256 } : HOLD)
    assert.equal(journal.read().outcome, after === selectedCommit ? 'REMOTE_SELECTED'
      : after === predecessorCommit ? 'REMOTE_NOT_SELECTED' : 'REMOTE_UNAVAILABLE')
  })
})

test('transition write, fsync and rename failures stop before push even if persistence is uncertain', async () => {
  for (const failure of ['write', 'file-fsync', 'rename', 'directory-fsync']) {
    let writes = 0, syncs = 0
    const fileSystem = { ...fs,
      writeSync(fd, buffer, offset, length, position) {
        writes++
        if (failure === 'write' && writes === 2) return 0
        return fs.writeSync(fd, buffer, offset, length, position)
      },
      fsyncSync(fd) {
        syncs++
        if (failure === 'file-fsync' && syncs === 3) throw Error('injected fsync failure')
        if (failure === 'directory-fsync' && syncs === 4) throw Error('injected fsync failure')
        return fs.fsyncSync(fd)
      },
      renameSync(oldPath, newPath) {
        if (failure === 'rename') throw Error('injected rename failure')
        return fs.renameSync(oldPath, newPath)
      },
    }
    await withWindow(async ({ journal }) => {
      let pushes = 0
      const coordinator = createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
        readRemote: async () => predecessorCommit, push: async () => { pushes++ },
      })
      assert.deepEqual(await coordinator.execute(selection), HOLD)
      assert.equal(pushes, 0, failure)
      assert.deepEqual(await coordinator.execute(selection), HOLD)
      assert.equal(pushes, 0, failure)
    }, fileSystem)
  }
})

test('uncertain terminal persistence cannot yield a publication receipt', async () => {
  for (const failure of ['file-fsync', 'directory-fsync', 'rename']) {
    let syncs = 0, renames = 0
    const fileSystem = { ...fs,
      fsyncSync(fd) {
        syncs++
        if (failure === 'file-fsync' && syncs === 5) throw Error('terminal file fsync failed')
        if (failure === 'directory-fsync' && syncs === 6) throw Error('terminal directory fsync failed')
        return fs.fsyncSync(fd)
      },
      renameSync(oldPath, newPath) {
        renames++
        if (failure === 'rename' && renames === 2) throw Error('terminal rename failed')
        return fs.renameSync(oldPath, newPath)
      },
    }
    await withWindow(async ({ journal }) => {
      let pushes = 0
      const result = await createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
        readRemote: async phase => phase === 'before' ? predecessorCommit : selectedCommit,
        push: async () => { pushes++ },
      }).execute(selection)
      assert.deepEqual(result, HOLD)
      assert.equal(pushes, 1)
    }, fileSystem)
  }
})

test('concurrent calls share a single-use latch before the first remote read resolves', async () => {
  await withWindow(async ({ journal }) => {
    let release, pushes = 0
    const pending = new Promise(resolve => { release = resolve })
    const coordinator = createStagingPreviewGitPublishCoordinator({ journal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async phase => phase === 'before' ? pending : selectedCommit,
      push: async () => { pushes++ },
    })
    const first = coordinator.execute(selection)
    assert.deepEqual(await coordinator.execute(selection), HOLD)
    release(predecessorCommit)
    assert.equal((await first).status, 'SOURCE_PUBLISHED_PREVIEW_UNVERIFIED')
    assert.equal(pushes, 1)
  })
})

test('malformed terminal journal receipt suppresses success after reconciliation', async () => {
  await withWindow(async ({ journal }) => {
    let pushes = 0
    const alteredJournal = { ...journal, finish(previous, outcome) {
      const record = journal.finish(previous, outcome)
      return { ...record, outcome: 'REMOTE_NOT_SELECTED' }
    } }
    const result = await createStagingPreviewGitPublishCoordinator({ journal: alteredJournal, recheckSource: async () => ({ status: "PUBLISH_SOURCE_SELECTED", ...selection }),
      readRemote: async phase => phase === 'before' ? predecessorCommit : selectedCommit,
      push: async () => { pushes++ },
    }).execute(selection)
    assert.deepEqual(result, HOLD)
    assert.equal(pushes, 1)
  })
})

test('coordinator has no ambient Git, token, fetch or deployment binding', async () => {
  const source = fs.readFileSync(new URL('../scripts/staging-preview-git-publish-coordinator.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /spawnSync|child_process|fetch\(|Keychain|process\.env|process\.argv/)
})
