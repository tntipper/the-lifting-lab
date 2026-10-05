import test from 'node:test'
import assert from 'node:assert/strict'
import * as fs from 'node:fs'
import { appendFileSync, chmodSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BROKER_RECOVERY_READ_JOURNAL_ENABLED, createBrokerRecoveryReadJournal,
  BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS } from '../scripts/staging-provider-broker-recovery-read-journal.mjs'

const phaseRunId = 'd80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const runId = 'b80746e1-7a8b-4b1a-9c2d-22cd94aaaf31'
const start = Date.parse('2026-09-25T12:00:00.000Z')
const path = () => join(mkdtempSync(join(tmpdir(), 'tll-broker-read-')), 'read.jsonl')
const make = (file, clock = { value: start }) => createBrokerRecoveryReadJournal({ path: file,
  makeRunId: () => runId, now: () => clock.value })

test('claim is durable and exclusive; result is categorical and cannot replay', () => {
  assert.equal(BROKER_RECOVERY_READ_JOURNAL_ENABLED, false)
  const file = path(), journal = make(file)
  const intent = journal.claim({ phaseRunId })
  assert.equal(journal.read().terminal, null)
  assert.throws(() => make(file).claim({ phaseRunId }))
  const receipt = journal.finish(intent, 'SAFE_HELD_CONFIGURATION_OBSERVED')
  assert.equal(journal.read().terminal.status, receipt.status)
  assert.throws(() => journal.finish(intent, receipt.status))
  assert.throws(() => make(file).claim({ phaseRunId }))
  const disk = readFileSync(file, 'utf8')
  assert.equal(disk.split('\n').filter(Boolean).length, 2)
  assert.equal(/token|client_secret|password/i.test(disk), false)
})

test('interrupted terminal write remains an uncertain consumed attempt', () => {
  const file = path(), journal = make(file)
  journal.claim({ phaseRunId })
  journal.close()
  appendFileSync(file, '{"status":')
  assert.throws(() => journal.read())
  assert.throws(() => make(file).claim({ phaseRunId }))
})

test('changed file identity and insecure permissions block finishing', () => {
  const file = path(), journal = make(file), intent = journal.claim({ phaseRunId })
  const original = readFileSync(file)
  renameSync(file, `${file}.old`)
  writeFileSync(file, original, { mode: 0o600 })
  assert.throws(() => journal.finish(intent, 'READ_UNAVAILABLE'))
  journal.close()
  const insecure = path(), second = make(insecure)
  second.claim({ phaseRunId }); second.close()
  chmodSync(insecure, 0o644)
  assert.throws(() => second.read())
  assert.throws(() => make(insecure).claim({ phaseRunId }))
})

test('expired read cannot acquire a successful terminal result', () => {
  const file = path(), clock = { value: start }, journal = make(file, clock)
  const intent = journal.claim({ phaseRunId })
  clock.value += BROKER_RECOVERY_READ_JOURNAL_DEADLINE_MS + 1
  assert.throws(() => journal.finish(intent, 'SAFE_HELD_CONFIGURATION_OBSERVED'))
  journal.close()
  assert.equal(journal.read().terminal, null)
  assert.throws(() => make(file).claim({ phaseRunId }))
})

test('a path swap during final disk sync cannot return a successful claim or finish', () => {
  for (const swapOnDirectorySync of [1, 2]) {
    const file = path(); let directorySyncs = 0
    const fileSystem = new Proxy(fs, { get(target, key) {
      if (key !== 'fsyncSync') return target[key]
      return fd => {
        target.fsyncSync(fd)
        if (target.fstatSync(fd).isDirectory() && ++directorySyncs === swapOnDirectorySync) {
          renameSync(file, `${file}.moved`)
        }
      }
    } })
    const journal = createBrokerRecoveryReadJournal({ path: file, fileSystem,
      makeRunId: () => runId, now: () => start })
    if (swapOnDirectorySync === 1) assert.throws(() => journal.claim({ phaseRunId }))
    else {
      const intent = journal.claim({ phaseRunId })
      assert.throws(() => journal.finish(intent, 'SAFE_HELD_CONFIGURATION_OBSERVED'))
      journal.close()
    }
    assert.equal(journal.read(), null)
  }
})
