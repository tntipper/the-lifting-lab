import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { STAGING_BRANCH } from '../scripts/staging-surface-activation-transport.mjs'
import { changeStagingCheckoutSetting } from '../scripts/staging-generation-23-checkout-setting.mjs'

const target = Object.freeze({ name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout123',
  branch: STAGING_BRANCH, environment: 'preview', classification: 'config' })
const signal = new AbortController().signal
async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-setting.mjs', import.meta.url), 'utf8')
  const dependency = new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url).href
  const enabled = source.replace('STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED = true')
    .replace("from './staging-surface-activation-transport.mjs'", `from '${dependency}'`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}
async function armedJournal() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-setting-journal.mjs', import.meta.url), 'utf8')
  const setting = new URL('../scripts/staging-generation-23-checkout-setting.mjs', import.meta.url).href
  const surface = new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url).href
  const enabled = source.replace('STAGING_GENERATION_23_CHECKOUT_SETTING_JOURNAL_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_SETTING_JOURNAL_ENABLED = true')
    .replace("from './staging-generation-23-checkout-setting.mjs'", `from '${setting}'`)
    .replace("from './staging-surface-activation-transport.mjs'", `from '${surface}'`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}
function fixture({ initial = false, lost = false, drift = false } = {}) {
  let value = initial, record = null
  const events = []
  const journal = { read: () => record,
    recordIntent: (action, selected) => { events.push(`intent:${action}`); record = {
      action, settingId: selected.id, state: 'INTENT_RECORDED' }; return record },
    transition: (intent, state) => { assert.equal(record, intent); record = { ...record, state }; events.push(`journal:${state}`) } }
  const read = async selected => {
    assert.deepEqual(selected, target); events.push('read')
    return { ...target, enabled: drift ? !value : value }
  }
  const write = async (selected, desired) => {
    assert.deepEqual(selected, target); events.push(`write:${desired}`); value = desired
    if (lost) throw Error('lost response after remote effect')
    return { ...target, enabled: desired }
  }
  return { journal, read, write, events, get value() { return value } }
}

test('ordinary source refuses every write', async () => {
  const f = fixture()
  await assert.rejects(changeStagingCheckoutSetting({ action: 'ENABLE', target, ...f, signal }), /unavailable/)
  assert.deepEqual(f.events, [])
})

test('one verified ON and one verified OFF use separate durable records', async () => {
  const { changeStagingCheckoutSetting: change } = await armed()
  const on = fixture()
  assert.equal((await change({ action: 'ENABLE', target, ...on, signal })).status,
    'CHECKOUT_SETTING_ENABLED_VERIFIED')
  assert.deepEqual(on.events, ['read', 'intent:ENABLE', 'write:true', 'read', 'journal:ENABLE_VERIFIED'])
  assert.equal(on.value, true)
  await assert.rejects(change({ action: 'ENABLE', target, ...on, signal }), /unavailable/)
  const off = fixture({ initial: true })
  assert.equal((await change({ action: 'FREEZE', target, ...off, signal })).status,
    'CHECKOUT_SETTING_HELD_VERIFIED')
  assert.equal(off.value, false)
  assert.equal(off.journal.read().state, 'FREEZE_VERIFIED')
})

test('missing, wrong-branch or wrong initial value stops before durable intent', async () => {
  const { changeStagingCheckoutSetting: change } = await armed()
  for (const selected of [{ ...target, branch: 'main' }, { ...target, classification: 'secret' }]) {
    const f = fixture()
    await assert.rejects(change({ action: 'ENABLE', target: selected, ...f, signal }), /unavailable/)
    assert.deepEqual(f.events, [])
  }
  const f = fixture({ initial: true })
  await assert.rejects(change({ action: 'ENABLE', target, ...f, signal }), /unavailable/)
  assert.deepEqual(f.events, ['read'])
})

test('a lost write response consumes the one-use record and cannot be replayed', async () => {
  const { changeStagingCheckoutSetting: change } = await armed()
  const f = fixture({ lost: true })
  assert.equal((await change({ action: 'ENABLE', target, ...f, signal })).status,
    'HOLD_RECONCILIATION_REQUIRED')
  assert.equal(f.value, true)
  assert.equal(f.journal.read().state, 'RECONCILIATION_REQUIRED')
  await assert.rejects(change({ action: 'ENABLE', target, ...f, signal }), /unavailable/)
  assert.equal(f.events.filter(event => event === 'write:true').length, 1)
})

test('a mismatched final read cannot be reported as a verified switch', async () => {
  const { changeStagingCheckoutSetting: change } = await armed()
  const f = fixture({ drift: true, initial: true })
  assert.equal((await change({ action: 'ENABLE', target, ...f, signal })).status,
    'HOLD_RECONCILIATION_REQUIRED')
  assert.equal(f.journal.read().state, 'RECONCILIATION_REQUIRED')
})

test('real one-use records bind exact setting ID, stay private and reject replay', async () => {
  const { changeStagingCheckoutSetting: change } = await armed()
  const { createStagingGeneration23CheckoutSettingJournal: createJournal } = await armedJournal()
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen23-checkout-journal-'))
  try {
    const path = join(directory, 'enable.json')
    const journal = createJournal({ action: 'ENABLE', path })
    const f = fixture()
    assert.equal((await change({ action: 'ENABLE', target, journal, read: f.read,
      write: f.write, signal })).status, 'CHECKOUT_SETTING_ENABLED_VERIFIED')
    assert.equal(journal.read().settingId, target.id)
    assert.equal(journal.read().state, 'ENABLE_VERIFIED')
    assert.equal(statSync(path).mode & 0o777, 0o600)
    const restarted = createJournal({ action: 'ENABLE', path })
    await assert.rejects(change({ action: 'ENABLE', target, journal: restarted,
      read: f.read, write: f.write, signal }), /unavailable/)
  } finally { rmSync(directory, { recursive: true, force: true }) }
})
