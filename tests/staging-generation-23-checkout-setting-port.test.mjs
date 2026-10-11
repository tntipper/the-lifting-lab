import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23CheckoutSettingPort } from '../scripts/staging-generation-23-checkout-setting-port.mjs'

const target = Object.freeze({ name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout123',
  branch: 'codex/tll-integration', environment: 'preview', classification: 'config' })
const token = Buffer.from('temporary-test-token')
const signal = new AbortController().signal
const payload = value => ({ id: target.id, key: target.name, gitBranch: target.branch,
  target: ['preview'], type: 'encrypted', visibility: 'config', decrypted: true,
  ...(value === undefined ? {} : { value }) })
const response = value => new Response(JSON.stringify(value), { status: 200,
  headers: { 'content-type': 'application/json' } })

async function armed() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-setting-port.mjs', import.meta.url), 'utf8')
  const root = new URL('../scripts/', import.meta.url)
  const enabled = source.replace('STAGING_GENERATION_23_CHECKOUT_SETTING_PORT_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_SETTING_PORT_ENABLED = true').replaceAll("from './", `from '${root.href}`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}

async function armedControl() {
  const source = await readFile(new URL('../scripts/staging-generation-23-checkout-setting.mjs', import.meta.url), 'utf8')
  const scripts = new URL('../scripts/', import.meta.url)
  const enabled = source.replace('STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED = false',
    'STAGING_GENERATION_23_CHECKOUT_SETTING_ENABLED = true').replaceAll("from './", `from '${scripts.href}`)
  assert.notEqual(enabled, source)
  return import(`data:text/javascript;base64,${Buffer.from(enabled).toString('base64')}`)
}

test('real checkout controller verifies encrypted acknowledgement through a separate GET', async () => {
  const [{ createStagingGeneration23CheckoutSettingPort: create },
    { changeStagingCheckoutSetting }] = await Promise.all([armed(), armedControl()])
  let calls = 0, finalState
  const journal = {
    read: () => null,
    recordIntent: (action, selected) => ({ action, settingId: selected.id, state: 'INTENT_RECORDED' }),
    transition: (_intent, state) => { finalState = state },
  }
  const port = create({ token, target, fetch: async (_url, options) => {
    calls++
    return response(options.method === 'PATCH' ? payload('ciphertext-not-plaintext')
      : payload(calls === 1 ? 'false' : 'true'))
  } })
  try {
    const result = await changeStagingCheckoutSetting({ action: 'ENABLE', target, journal,
      read: port.read, write: port.write, signal })
    assert.equal(result.status, 'CHECKOUT_SETTING_ENABLED_VERIFIED')
    assert.equal(finalState, 'ENABLE_VERIFIED')
    assert.equal(calls, 3)
  } finally { port.dispose() }
})

test('real checkout controller holds when encrypted acknowledgement is followed by the old value', async () => {
  const [{ createStagingGeneration23CheckoutSettingPort: create },
    { changeStagingCheckoutSetting }] = await Promise.all([armed(), armedControl()])
  let calls = 0, finalState
  const journal = {
    read: () => null,
    recordIntent: (action, selected) => ({ action, settingId: selected.id, state: 'INTENT_RECORDED' }),
    transition: (_intent, state) => { finalState = state },
  }
  const port = create({ token, target, fetch: async (_url, options) => {
    calls++
    return response(options.method === 'PATCH' ? payload('ciphertext-not-plaintext') : payload('false'))
  } })
  try {
    const result = await changeStagingCheckoutSetting({ action: 'ENABLE', target, journal,
      read: port.read, write: port.write, signal })
    assert.equal(result.status, 'HOLD_RECONCILIATION_REQUIRED')
    assert.equal(finalState, 'RECONCILIATION_REQUIRED')
    assert.equal(calls, 3)
  } finally { port.dispose() }
})

test('ordinary source cannot read or write', () => {
  assert.throws(() => createStagingGeneration23CheckoutSettingPort({ token, target,
    fetch: async () => response(payload('false')) }), /unavailable/)
})

test('fixed GET, one PATCH and GET prove ON while preserving Preview branch', async () => {
  const { createStagingGeneration23CheckoutSettingPort: create } = await armed()
  const calls = []
  const port = create({ token, target, fetch: async (url, options) => {
    calls.push({ url, options })
    return response(options.method === 'GET' ? payload(calls.length === 1 ? 'false' : 'true')
      : payload('encrypted-value-not-plaintext'))
  } })
  assert.deepEqual(await port.read(target, { signal }), { ...target, enabled: false })
  assert.deepEqual(await port.write(target, true, { signal }), { ...target, enabled: true })
  assert.deepEqual(await port.read(target, { signal }), { ...target, enabled: true })
  assert.deepEqual(calls.map(item => item.options.method), ['GET', 'PATCH', 'GET'])
  assert.match(calls[0].url, /^https:\/\/api\.vercel\.com\/v1\/projects\/prj_[^/]+\/env\/env_checkout123\?teamId=team_/)
  assert.match(calls[1].url, /^https:\/\/api\.vercel\.com\/v9\/projects\/prj_[^/]+\/env\/env_checkout123\?teamId=team_/)
  assert.deepEqual(JSON.parse(calls[1].options.body), { value: 'true' })
  assert.equal(calls.every(item => item.options.redirect === 'error'), true)
  await assert.rejects(port.read(target, { signal }), /unavailable/)
  port.dispose()
})

test('the same fixed port can perform the separate OFF transition', async () => {
  const { createStagingGeneration23CheckoutSettingPort: create } = await armed()
  let count = 0
  const port = create({ token, target, fetch: async (_url, options) => {
    count++
    return response(options.method === 'GET' ? payload(count === 1 ? 'true' : 'false')
      : payload('********'))
  } })
  assert.equal((await port.read(target, { signal })).enabled, true)
  assert.equal((await port.write(target, false, { signal })).enabled, false)
  assert.equal((await port.read(target, { signal })).enabled, false)
  port.dispose()
})

test('wrong scope, target, value and unexpected response stop further writes', async () => {
  const { createStagingGeneration23CheckoutSettingPort: create } = await armed()
  assert.throws(() => create({ token, target: { ...target, branch: 'main' },
    fetch: async () => response(payload('false')) }), /unavailable/)
  let writes = 0
  const port = create({ token, target, fetch: async (_url, options) => {
    if (options.method === 'PATCH') writes++
    return response(options.method === 'GET' ? payload('false') : { ...payload(), gitBranch: 'main' })
  } })
  await assert.rejects(port.read({ ...target }, { signal }), /unavailable/)
  await assert.rejects(port.write(target, true, { signal }), /unavailable/)
  await port.read(target, { signal })
  await assert.rejects(port.write(target, true, { signal }), /unavailable/)
  await assert.rejects(port.write(target, true, { signal }), /unavailable/)
  assert.equal(writes, 1)
  port.dispose()
})

test('a lost PATCH reply cannot be retried or mistaken for a verified state', async () => {
  const { createStagingGeneration23CheckoutSettingPort: create } = await armed()
  let writes = 0
  const port = create({ token, target, fetch: async (_url, options) => {
    if (options.method === 'GET') return response(payload('false'))
    writes++
    throw Error('reply lost')
  } })
  await port.read(target, { signal })
  await assert.rejects(port.write(target, true, { signal }), /reply lost/)
  await assert.rejects(port.write(target, true, { signal }), /unavailable/)
  assert.equal(writes, 1)
  port.dispose()
})

test('a masked PATCH acknowledgement cannot substitute for decrypted GET verification', async () => {
  const { createStagingGeneration23CheckoutSettingPort: create } = await armed()
  let reads = 0, writes = 0
  const port = create({ token, target, fetch: async (_url, options) => {
    if (options.method === 'PATCH') { writes++; return response(payload('********')) }
    reads++
    return response(payload('false'))
  } })
  assert.equal((await port.read(target, { signal })).enabled, false)
  assert.equal((await port.write(target, true, { signal })).enabled, true)
  assert.equal((await port.read(target, { signal })).enabled, false)
  assert.equal(reads, 2)
  assert.equal(writes, 1)
  await assert.rejects(port.write(target, true, { signal }), /unavailable/)
  port.dispose()
})
