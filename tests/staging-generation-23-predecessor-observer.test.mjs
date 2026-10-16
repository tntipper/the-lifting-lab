import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23PredecessorJournal } from '../scripts/staging-generation-23-predecessor-journal.mjs'
import { createStagingGeneration23PredecessorObserver,
  STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED } from '../scripts/staging-generation-23-predecessor-observer.mjs'

const tokenText = `sbp_${'a'.repeat(40)}`
const digest = 'b'.repeat(64)
const proof = { status: 'PASS_RETIRED', projectRef: 'qdmvngjwkcsilzmqksme',
  queryId: 'tll-staging-generation-23-predecessor-check/v1', receiptSha256: digest }

async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-23-predecessor-observer.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED = false',
      'export const STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

function journal() {
  const path = join(mkdtempSync(join(tmpdir(), 'tll-gen23-observer-')), 'record.json')
  return createStagingGeneration23PredecessorJournal({ path })
}

test('the observer is disabled by default', () => {
  assert.equal(STAGING_GENERATION_23_PREDECESSOR_OBSERVER_ENABLED, false)
  assert.throws(() => createStagingGeneration23PredecessorObserver(), /unavailable/)
})

test('one validated staging read records dispatch before the call and erases the token', async () => {
  const { createStagingGeneration23PredecessorObserver: create } = await armedFixture()
  const record = journal(), token = Buffer.from(tokenText)
  let calls = 0
  const observer = create({ journal: record, readToken: async () => token,
    post: async ({ token: held, signal }) => {
      calls++
      assert.equal(record.read().state, 'DISPATCHED')
      assert.equal(held, token)
      assert.equal(signal.aborted, false)
      return [{}]
    }, validate: () => proof })
  assert.equal((await observer.observe({ signal: new AbortController().signal })).status, 'PASS_RETIRED')
  assert.equal(record.read().outcome, 'PASS_RETIRED')
  assert.equal(record.read().receiptSha256, digest)
  assert.equal(calls, 1)
  assert.equal(token.every(byte => byte === 0), true)
  await assert.rejects(observer.observe({ signal: new AbortController().signal }), /unavailable/)
})

test('a failed or wrong-target response consumes the one-use record without retry', async () => {
  const { createStagingGeneration23PredecessorObserver: create } = await armedFixture()
  for (const validate of [() => { throw Error('bad response') },
    () => ({ ...proof, projectRef: 'wrhgscovsgsudtedbljr' })]) {
    const record = journal(), token = Buffer.from(tokenText)
    let calls = 0
    const observer = create({ journal: record, readToken: async () => token,
      post: async () => { calls++; return [{}] }, validate })
    assert.equal((await observer.observe({ signal: new AbortController().signal })).status, 'READ_UNAVAILABLE')
    assert.equal(record.read().state, 'FINISHED')
    assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
    assert.equal(calls, 1)
    assert.equal(token.every(byte => byte === 0), true)
  }
})

test('credential failure never dispatches and an existing record blocks another run', async () => {
  const { createStagingGeneration23PredecessorObserver: create } = await armedFixture()
  const record = journal()
  let calls = 0
  const make = () => create({ journal: record, readToken: async () => { throw Error('Keychain denied') },
    post: async () => { calls++ }, validate: () => proof })
  assert.equal((await make().observe({ signal: new AbortController().signal })).status, 'READ_UNAVAILABLE')
  assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
  assert.equal((await make().observe({ signal: new AbortController().signal })).status, 'REPLAY_REJECTED')
  assert.equal(calls, 0)
})

test('external abort rejects a late success after dispatch', async () => {
  const { createStagingGeneration23PredecessorObserver: create } = await armedFixture()
  const record = journal(), controller = new AbortController()
  const observer = create({ journal: record, readToken: async () => Buffer.from(tokenText),
    post: async () => { controller.abort(); return [{}] }, validate: () => proof })
  assert.equal((await observer.observe({ signal: controller.signal })).status, 'READ_UNAVAILABLE')
  assert.equal(record.read().outcome, 'READ_UNAVAILABLE')
})
