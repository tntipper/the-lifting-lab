import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createStagingGeneration22IncidentJournal } from '../scripts/staging-generation-22-incident-journal.mjs'

const source = new URL('../scripts/staging-generation-22-incident-journal.mjs', import.meta.url)
const material = new URL('../scripts/staging-generation-22-material.mjs', import.meta.url)
const originalExpiry = '2026-09-26T19:52:00.000Z'
const afterExpiry = Date.parse('2026-09-26T20:00:00.000Z')
const deadline = '2026-09-26T20:30:00.000Z'

test('incident journal remains disconnected by default', () => {
  assert.throws(() => createStagingGeneration22IncidentJournal(), /unavailable/)
})

test('a distinct incident record can retire after original login expiry exactly once', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tll-gen22-journal-test-'))
  try {
    const credentials = join(directory, 'credentials.mjs')
    await writeFile(credentials, `export const ACTIVE_WINDOW_EXPIRES_AT = '${originalExpiry}'\n`
      + "export const WINDOW_ID = '9a539def-bf3c-442c-bf06-c4bd1df39543'\n")
    const copy = join(directory, 'journal.mjs')
    const code = (await readFile(source, 'utf8'))
      .replace('export const STAGING_GENERATION_22_INCIDENT_JOURNAL_ENABLED = false',
        'export const STAGING_GENERATION_22_INCIDENT_JOURNAL_ENABLED = true')
      .replace("export const INCIDENT_DEADLINE = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
        `export const INCIDENT_DEADLINE = '${deadline}'`)
      .replace("from './staging-generation-22-credentials.mjs'", `from '${pathToFileURL(credentials).href}'`)
      .replace("from './staging-generation-22-material.mjs'", `from '${material.href}'`)
    await writeFile(copy, code)
    const { createStagingGeneration22IncidentJournal: create } = await import(pathToFileURL(copy).href)
    const path = join(directory, 'record', 'incident.json')
    const journal = create({ path, now: () => afterExpiry,
      makeRunId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' })
    const claimed = journal.claim()
    assert.equal(claimed.state, 'CLAIMED')
    assert.equal(claimed.originalExpiry, originalExpiry)
    assert.throws(() => create({ path, now: () => afterExpiry }).claim(), /unavailable/)
    const dispatched = journal.dispatch(claimed)
    assert.equal(dispatched.state, 'DISPATCHED')
    const finished = journal.confirm(dispatched, 'a'.repeat(64))
    assert.equal(finished.state, 'FINISHED')
    assert.throws(() => journal.dispatch(dispatched), /unavailable/)
    assert.throws(() => journal.hold(dispatched), /unavailable/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})
