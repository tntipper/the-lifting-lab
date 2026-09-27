import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, lstatSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration23ConnectionDiagnostic } from '../scripts/staging-generation-23-connection-diagnostic.mjs'

const scripts = new URL('../scripts/', import.meta.url)
let armedSource = readFileSync(new URL('staging-generation-23-connection-diagnostic.mjs', scripts), 'utf8')
armedSource = armedSource.replace('STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED = false',
  'STAGING_GENERATION_23_CONNECTION_DIAGNOSTIC_ENABLED = true')
  .replaceAll('import.meta.dirname', JSON.stringify(fileURLToPath(scripts)))
  .replaceAll("from './", `from '${scripts.href}`)
const { createStagingGeneration23ConnectionDiagnostic: createArmed } = await import(
  `data:text/javascript;base64,${Buffer.from(armedSource).toString('base64')}`)
const sourceCommit = 'a'.repeat(40)

const window = () => ({ expiresAt: new Date(Date.now() + 900_000).toISOString(),
  deadlineAt: new Date(Date.now() + 360_000).toISOString() })

test('ordinary source rejects before it can access a filesystem', () => {
  assert.throws(() => createStagingGeneration23ConnectionDiagnostic({
    sourceCommit, fileSystem: { lstatSync() { throw Error('must not read') } },
  }), /unavailable/)
})

test('the private one-use record retains only fixed connection failure categories', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-connection-'))
  const path = join(directory, 'record.json')
  try {
    const journal = createArmed({ path, sourceCommit })
    let record = journal.claim(window())
    assert.equal(record.state, 'CLAIMED')
    assert.equal(lstatSync(path).mode & 0o777, 0o600)
    assert.equal(lstatSync(path).nlink, 1)
    record = journal.progress(record, { step: 'correct_roles' })
    record = journal.hold(record, { outcome: 'correct_role_failed', purpose: 'cart', check: 'matrix' })
    assert.equal(journal.read().state, 'HOLD')
    assert.equal(journal.read().check, 'matrix')
    assert.equal(journal.read().purpose, 'cart')
    assert.deepEqual(Object.keys(JSON.parse(readFileSync(path, 'utf8'))).sort(),
      ['schema', 'projectRef', 'windowId', 'sourceCommit', 'runId', 'expiresAt', 'deadlineAt', 'createdAt',
        'updatedAt', 'state', 'sequence', 'step', 'purpose', 'check', 'outcome', 'connectionEvidence'].sort())
    assert.throws(() => journal.hold(record, { outcome: 'correct_role_failed', purpose: 'cart',
      check: 'connect_retry', connectionEvidence: { first: { message: 'SYNTHETIC_PASSWORD' }, second: null } }), /unavailable/)
    assert.throws(() => journal.claim(window()), /unavailable/)
    assert.throws(() => journal.progress(record, { step: 'drain' }), /unavailable/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})

test('PASS requires completed cleanup and an existing symbolic link cannot be claimed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-connection-'))
  const path = join(directory, 'record.json')
  try {
    const journal = createArmed({ path, sourceCommit })
    let record = journal.claim(window())
    assert.throws(() => journal.pass(record), /unavailable/)
    record = journal.progress(record, { step: 'correct_roles' })
    assert.throws(() => journal.progress(record, { step: 'cleanup' }), /unavailable/)
    for (const purpose of ['customer', 'cart', 'broker', 'provisional', 'bridge']) {
      record = journal.progress(record, { step: 'wrong_password', purpose })
    }
    record = journal.progress(record, { step: 'final_good', purpose: 'customer', check: 'connect' })
    record = journal.progress(record, { step: 'final_good', purpose: 'bridge' })
    record = journal.progress(record, { step: 'drain' })
    record = journal.progress(record, { step: 'cleanup' })
    record = journal.pass(record)
    assert.equal(record.state, 'PASS')
    assert.equal(journal.read().state, 'PASS')
    assert.throws(() => journal.hold(record, { outcome: 'unavailable' }), /unavailable/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
  const second = mkdtempSync(join(tmpdir(), 'tll-gen23-connection-'))
  try {
    const link = join(second, 'record.json')
    symlinkSync(join(second, 'absent'), link)
    assert.throws(() => createArmed({ path: link, sourceCommit }).claim(window()), /unavailable/)
  } finally { rmSync(second, { recursive: true, force: true }) }
})
