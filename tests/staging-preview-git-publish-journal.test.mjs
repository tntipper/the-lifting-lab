import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { createPreviewGitPublishJournal } from '../scripts/staging-preview-git-publish-journal.mjs'

const selectedCommit = 'a'.repeat(40), predecessorCommit = 'b'.repeat(40), manifestSha256 = 'c'.repeat(64)
const source = { selectedCommit, predecessorCommit, manifestSha256 }
const runId = '12345678-1234-4234-8234-123456789abc'
const create = (path, fileSystem = fs) => createPreviewGitPublishJournal({ path, fileSystem, makeRunId: () => runId,
  now: () => Date.parse('2026-09-24T12:00:00.000Z') })
const hold = fn => assert.throws(fn, /Preview Git publish journal unavailable/)
function withPath(fn) {
  const directory = fs.mkdtempSync(resolve(tmpdir(), 'tll-publish-journal-'))
  try { return fn(resolve(directory, 'private', 'intent.json')) }
  finally { fs.rmSync(directory, { recursive: true, force: true }) }
}

test('exclusive private journal records selected source before one durable dispatch and consumes result', () => withPath(path => {
  const journal = create(path)
  const intent = journal.start(source)
  assert.equal(intent.phase, 'PREPARED')
  assert.equal(intent.selectedCommit, selectedCommit)
  assert.equal(intent.predecessorCommit, predecessorCommit)
  assert.equal(intent.manifestSha256, manifestSha256)
  assert.equal(fs.statSync(path).mode & 0o777, 0o600)
  assert.equal(fs.statSync(resolve(path, '..')).mode & 0o777, 0o700)
  hold(() => create(path).start(source))
  hold(() => journal.finish(intent, 'REMOTE_SELECTED'))
  const dispatched = journal.recordDispatch(intent)
  assert.equal(dispatched.phase, 'DISPATCH_RECORDED')
  hold(() => journal.recordDispatch(intent))
  hold(() => journal.finish(intent, 'REMOTE_SELECTED'))
  const finished = journal.finish(dispatched, 'REMOTE_SELECTED')
  assert.equal(finished.outcome, 'REMOTE_SELECTED')
  assert.equal(journal.read().outcome, 'REMOTE_SELECTED')
  hold(() => journal.finish(dispatched, 'REMOTE_SELECTED'))
  hold(() => create(path).start(source))
}))

test('abort before push and uncertain remote outcome both consume the one-use journal', () => {
  for (const outcome of ['ABORTED_BEFORE_PUSH', 'REMOTE_NOT_SELECTED', 'REMOTE_UNAVAILABLE']) withPath(path => {
    const journal = create(path), intent = journal.start(source)
    if (outcome === 'ABORTED_BEFORE_PUSH') {
      assert.equal(journal.finish(intent, outcome).outcome, outcome)
      hold(() => journal.recordDispatch(intent))
    } else {
      const dispatched = journal.recordDispatch(intent)
      hold(() => journal.finish(dispatched, 'ABORTED_BEFORE_PUSH'))
      assert.equal(journal.finish(dispatched, outcome).outcome, outcome)
    }
    hold(() => create(path).start(source))
  })
})

test('malformed source, changed journal bytes and unsafe file type hold closed', () => withPath(path => {
  const journal = create(path)
  for (const candidate of [
    { ...source, selectedCommit: 'short' }, { ...source, predecessorCommit: selectedCommit },
    { ...source, manifestSha256: ['c'.repeat(64)] },
  ]) { hold(() => journal.start(candidate)); assert.equal(fs.existsSync(path), false) }
  const intent = journal.start(source)
  fs.writeFileSync(path, JSON.stringify({ ...intent, selectedCommit: 'd'.repeat(40) }) + '\n', { mode: 0o600 })
  hold(() => journal.recordDispatch(intent))
  hold(() => journal.recordDispatch(journal.read()))
  hold(() => create(path).start(source))
}))

test('restored earlier bytes cannot authorize a second dispatch or roll back the owned phase', () => withPath(path => {
  const journal = create(path), intent = journal.start(source)
  const preparedBytes = fs.readFileSync(path)
  const dispatched = journal.recordDispatch(intent)
  assert.equal(dispatched.phase, 'DISPATCH_RECORDED')
  fs.writeFileSync(path, preparedBytes)
  hold(() => journal.recordDispatch(intent))
  hold(() => journal.finish(intent, 'ABORTED_BEFORE_PUSH'))
  hold(() => journal.finish(journal.read(), 'ABORTED_BEFORE_PUSH'))
  preparedBytes.fill(0)
}))

test('short writes are completed; zero writes leave a consumed, unreadable intent rather than retrying', () => {
  withPath(path => {
    const fileSystem = { ...fs, writeSync(fd, buffer, offset, length, position) {
      return fs.writeSync(fd, buffer, offset, Math.min(3, length), position)
    } }
    const journal = create(path, fileSystem)
    const intent = journal.start(source)
    const dispatched = journal.recordDispatch(intent)
    assert.equal(journal.finish(dispatched, 'REMOTE_SELECTED').outcome, 'REMOTE_SELECTED')
  })
  withPath(path => {
    const fileSystem = { ...fs, writeSync() { return 0 } }
    hold(() => create(path, fileSystem).start(source))
    assert.equal(fs.existsSync(path), true)
    hold(() => create(path).start(source))
  })
})

test('nonprivate parent and symlink journal paths hold closed', () => withPath(path => {
  fs.mkdirSync(resolve(path, '..'), { mode: 0o700 })
  fs.chmodSync(resolve(path, '..'), 0o755)
  hold(() => create(path).start(source))
  fs.chmodSync(resolve(path, '..'), 0o700)
  const target = resolve(path, '..', 'target')
  fs.writeFileSync(target, 'not a journal', { mode: 0o600 })
  fs.symlinkSync(target, path)
  hold(() => create(path).start(source))
}))
