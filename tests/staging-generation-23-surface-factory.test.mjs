import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { STAGING_ALIAS } from '../scripts/staging-surface-activation-transport.mjs'
import { createProtectedRouter } from '../scripts/staging-generation-23-surface-factory.mjs'

const script = new URL('../scripts/staging-generation-23-surface-factory.mjs', import.meta.url)
const source = await readFile(script, 'utf8')
const armed = await import(`data:text/javascript;base64,${Buffer.from(source
  .replace('export const STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED = false',
    'export const STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED = true')
  .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)

async function factoryWithRealPreviewPort() {
  const previewSource = await readFile(new URL('../scripts/staging-generation-23-preview-build-port.mjs', import.meta.url), 'utf8')
  const transportUrl = new URL('../scripts/staging-surface-activation-transport.mjs', import.meta.url).href
  const previewUrl = `data:text/javascript;base64,${Buffer.from(previewSource
    .replace('export const STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED = false',
      'export const STAGING_GENERATION_23_PREVIEW_BUILD_PORT_ENABLED = true')
    .replace("from './staging-surface-activation-transport.mjs'", `from '${transportUrl}'`)).toString('base64')}`
  return import(`data:text/javascript;base64,${Buffer.from(source
    .replace('export const STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED = false',
      'export const STAGING_GENERATION_23_SURFACE_FACTORY_ENABLED = true')
    .replace("from './staging-generation-23-preview-build-port.mjs'", `from '${previewUrl}'`)
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
}

const nowMs = Date.parse('2026-09-27T12:00:00.000Z')
const requirements = { sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64), observedAt: new Date(nowMs).toISOString() }
const held = { target: { projectRef: 'qdmvngjwkcsilzmqksme', vercelProject: 'the-lifting-lab', vercelScope: 'my-lifting-lab-s-projects', branch: 'codex/tll-integration', environment: 'preview', alias: 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app' }, deploymentId: 'dpl_heldA', immutableUrl: 'https://held-a.vercel.app', ...requirements, ready: true, createdAt: new Date(nowMs - 1_000).toISOString() }
const target = { name: 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED', id: 'env_checkout', branch: 'codex/tll-integration', environment: 'preview', classification: 'config' }
const credentials = { vercelToken: Buffer.from('vercel-token'), previewBypass: Buffer.from('preview-bypass') }
const signal = new AbortController().signal

test('held Preview has a fresh three-read allowance for the final independent check', async () => {
  const raw = await readFile(new URL('../scripts/staging-generation-23-protected-fetch.mjs', import.meta.url), 'utf8')
  const protectedModule = await import(`data:text/javascript;base64,${Buffer.from(raw
    .replace('export const STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED = false',
      'export const STAGING_GENERATION_23_PROTECTED_FETCH_ENABLED = true')
    .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)).toString('base64')}`)
  const calls = []
  const router = createProtectedRouter({ initialDeployment: held, bypass: credentials.previewBypass,
    fetcher: async (url, options) => {
      calls.push({ url, bypass: options.headers.get('x-vercel-protection-bypass') })
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }, makeProtectedFetch: protectedModule.createStagingGeneration23ProtectedFetch })
  const read = () => router.fetch(`${STAGING_ALIAS}/api/staging/readiness`, { method: 'GET', signal })
  for (let i = 0; i < 3; i++) assert.equal((await read()).status, 200)
  await assert.rejects(read(), /unavailable/)
  router.renew(held)
  for (let i = 0; i < 3; i++) assert.equal((await read()).status, 200)
  assert.equal(calls.length, 6)
  assert.ok(calls.every(call => call.bypass === credentials.previewBypass.toString('utf8')))
  router.dispose()
})

function fixture({ price = 1999, finalCheckoutOn = false, finalSurfaceStatus = 'FINAL_SURFACES_HELD_VERIFIED',
  clock = { value: nowMs }, driftHeld = false, driftOwnerAlias = false } = {}) {
  const calls = [], journals = { enableSurface: {}, freezeSurface: {}, checkoutEnable: {}, checkoutFreeze: {} }
  let aliasDeploymentId = 'dpl_heldA'
  const identity = enabled => ({ deploymentId: enabled ? 'dpl_enabledA' : 'dpl_frozenA', immutableUrl: enabled ? 'https://enabled-a.vercel.app' : 'https://frozen-a.vercel.app', ...requirements, ready: true, createdAt: new Date(nowMs).toISOString() })
  const factories = {
    createProtectedFetch: ({ immutableUrl }) => ({ fetch: async () => { throw Error(`unexpected protected read ${immutableUrl}`) }, dispose() { calls.push(`dispose:${immutableUrl}`) } }),
    createBinding: () => ({ readDeployment: async (_target, id) => {
      if (id === 'dpl_heldA') throw Error('Git build has no custom manifest metadata')
      const receipt = { ...(id === 'dpl_heldA' ? held : identity(id !== 'dpl_frozenA')) }
      delete receipt.target; delete receipt.observedAt
      if (driftHeld && id === 'dpl_heldA') receipt.sourceCommit = 'c'.repeat(40)
      return receipt
    }, readPublishedGitDeployment: async (_target, id) => {
      if (id !== 'dpl_heldA') throw Error('Only initial Git build is allowed')
      const receipt = { ...held }
      delete receipt.target; delete receipt.observedAt; delete receipt.manifestSha256
      if (driftHeld) receipt.sourceCommit = 'c'.repeat(40)
      return receipt
    }, resolveAlias: async () => ({ deploymentId: 'dpl_heldA', immutableUrl: held.immutableUrl }) }),
    createPreviewPort: () => ({ createDeployment: async () => identity(true) }),
    createPorts: () => ({ readSurfaceFlags: async () => ({}),
      resolveAlias: async () => {
        calls.push('alias:read')
        const id = driftOwnerAlias ? 'dpl_drifted' : aliasDeploymentId
        return { alias: STAGING_ALIAS, deploymentId: id,
          immutableUrl: id === 'dpl_enabledA' ? identity(true).immutableUrl : held.immutableUrl }
      } }),
    createCheckoutPort: () => ({ read: async () => ({ ...target, enabled: finalCheckoutOn }), write: async () => ({ ...target, enabled: true }), dispose() { calls.push('checkout-dispose') } }),
    changeCheckoutSetting: async ({ action }) => { calls.push(`checkout:${action}`); return { status: action === 'ENABLE' ? 'CHECKOUT_SETTING_ENABLED_VERIFIED' : 'CHECKOUT_SETTING_HELD_VERIFIED' } },
    enableSurfaces: async () => { calls.push('surface:enable'); aliasDeploymentId = 'dpl_enabledA';
      return { status: 'SURFACES_ENABLED_VERIFIED', deployment: identity(true) } },
    freezeSurfaces: async () => { calls.push('surface:freeze'); return { status: 'SURFACES_HELD_VERIFIED', deployment: identity(false) } },
    readFinalHeld: async () => { calls.push('surface:final-read'); return { status: finalSurfaceStatus, deployment: identity(false) } },
    createCheckoutReadinessReader: ({ deploymentId }) => ({ read: async ({ expected }) => { calls.push(`runtime:${deploymentId}:${expected}`); return { status: 'CHECKOUT_RUNTIME_VERIFIED', checkoutHandoffEnabled: expected } }, dispose() { calls.push(`runtime-dispose:${deploymentId}`) } }),
    runOwnerJourney: async input => { assert.equal(input.applicationOrigin, STAGING_ALIAS)
      await input.verifyAlias({ signal: input.signal })
      calls.push(`owner:${input.expectedUnitPricePence}`); return { status: 'OWNER_JOURNEY_VERIFIED_NO_PURCHASE' } },
  }
  const build = armed.createStagingGeneration23SurfaceFactory({ credentials, fetch: async () => {}, runCli: async () => {}, execute: async () => {},
    preflight: { heldEvidence: held, requirements }, preview: { enabledJournal: {}, heldJournal: {}, runBuild: async () => {} }, journals,
    checkoutTarget: target, readVariantPrice: async () => ({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED', variantId: armed.STAGING_GENERATION_23_SHOPIFY_VARIANT_ID, pricePence: price, observedAt: new Date(clock.value).toISOString() }),
    now: () => clock.value, factories })
  return { ...build, calls, factories }
}

test('ordinary source remains unavailable before any construction', async () => {
  const plain = await import(`${script.href}?plain=${Date.now()}`)
  assert.throws(() => plain.createStagingGeneration23SurfaceFactory({}), /unavailable/)
})

test('long preparation refreshes pinned held evidence before checkout is enabled', async () => {
  const clock = { value: nowMs }
  const f = fixture({ clock })
  clock.value += 6 * 60_000
  assert.equal((await f.ports.enableSurface({ signal })).status, 'SURFACES_ENABLED_VERIFIED')
  assert.ok(f.calls.includes('checkout:ENABLE'))
  f.dispose()
})

test('held source drift prevents checkout mutation after long preparation', async () => {
  const clock = { value: nowMs }
  const f = fixture({ clock, driftHeld: true })
  clock.value += 6 * 60_000
  await assert.rejects(f.ports.enableSurface({ signal }), /unavailable/)
  assert.equal(f.calls.includes('checkout:ENABLE'), false)
  f.dispose()
})

test('connects fresh Shopify price, checkout setting, enabled Preview, owner check and held Preview in order', async () => {
  const f = fixture()
  const on = await f.ports.enableSurface({ signal })
  assert.equal(on.status, 'SURFACES_ENABLED_VERIFIED')
  assert.equal((await f.ports.runOwnerJourney({ signal, phaseDeadlineAt: new Date(nowMs + 60_000).toISOString(), deployment: on.deployment })).status,
    'OWNER_JOURNEY_VERIFIED_NO_PURCHASE')
  assert.equal((await f.ports.freezeSurface({ signal, deployment: on.deployment })).status, 'SURFACES_HELD_VERIFIED')
  assert.deepEqual(f.calls.filter(item => !item.startsWith('dispose:')), [
    'checkout:ENABLE', 'checkout-dispose', 'surface:enable', 'runtime:dpl_enabledA:true', 'runtime-dispose:dpl_enabledA',
    'alias:read', 'owner:1999', 'checkout:FREEZE', 'checkout-dispose', 'surface:freeze', 'runtime:dpl_frozenA:false', 'runtime-dispose:dpl_frozenA',
  ])
})

test('owner browser cannot start if the registered alias points to another deployment', async () => {
  const f = fixture({ driftOwnerAlias: true })
  const on = await f.ports.enableSurface({ signal })
  await assert.rejects(f.ports.runOwnerJourney({ signal,
    phaseDeadlineAt: new Date(nowMs + 60_000).toISOString(), deployment: on.deployment }), /unavailable/)
  assert.equal(f.calls.includes('owner:1999'), false)
  f.dispose()
})

test('final surface read detects held alias drift and a checkout switch left on', async () => {
  for (const options of [{ finalCheckoutOn: true }, { finalSurfaceStatus: 'ALIAS_DRIFT' }]) {
    const f = fixture(options)
    const on = await f.ports.enableSurface({ signal })
    await f.ports.freezeSurface({ signal, deployment: on.deployment })
    await assert.rejects(f.ports.readFinalSurface({ signal }), /unavailable/)
    f.dispose()
  }
  const pass = fixture(), on = await pass.ports.enableSurface({ signal })
  await pass.ports.freezeSurface({ signal, deployment: on.deployment })
  assert.deepEqual(await pass.ports.readFinalSurface({ signal }), { status: 'FINAL_SURFACES_HELD_VERIFIED' })
  pass.dispose()
})

test('a stale Shopify price stops before checkout or surface writes', async () => {
  const f = fixture()
  // Override the factory's reader with a stale time by rebuilding a minimal instance.
  const stale = armed.createStagingGeneration23SurfaceFactory({ credentials, fetch: async () => {}, runCli: async () => {}, execute: async () => {},
    preflight: { heldEvidence: held, requirements }, preview: { enabledJournal: {}, heldJournal: {}, runBuild: async () => {} },
    journals: { enableSurface: {}, freezeSurface: {}, checkoutEnable: {}, checkoutFreeze: {} }, checkoutTarget: target,
    readVariantPrice: async () => ({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED', variantId: armed.STAGING_GENERATION_23_SHOPIFY_VARIANT_ID, pricePence: 1999, observedAt: new Date(nowMs - 300_001).toISOString() }),
    now: () => nowMs, factories: { ...f.factories } })
  await assert.rejects(stale.ports.enableSurface({ signal }), /unavailable/)
  f.dispose(); stale.dispose()
})

test('owner journey cannot run before a fresh verified price and enabled deployment', async () => {
  const f = fixture()
  await assert.rejects(f.ports.runOwnerJourney({ signal, phaseDeadlineAt: new Date(nowMs + 60_000).toISOString(), deployment: held }), /unavailable/)
  f.dispose()
})

test('real Preview bridge receives its target-bearing deployment receipt while native ports retain the compact receipt', async () => {
  const joined = await factoryWithRealPreviewPort(), f = fixture()
  let enabledRecord = null, heldRecord = null
  const previewJournals = [
    { read: () => enabledRecord, set: value => { enabledRecord = value } },
    { read: () => heldRecord, set: value => { heldRecord = value } },
  ]
  const withoutPreviewMock = Object.fromEntries(Object.entries(f.factories)
    .filter(([name]) => name !== 'createPreviewPort'))
  const factories = {
    ...withoutPreviewMock,
    createPorts: ({ createDeployment }) => ({ createDeployment, readSurfaceFlags: async () => ({}) }),
    enableSurfaces: async ({ ports }) => {
      const result = await ports.createDeployment(held.target, { branch: 'codex/tll-integration',
        sourceCommit: requirements.sourceCommit, manifestSha256: requirements.manifestSha256,
        publicCustomer: true, publicCart: true, project: 'the-lifting-lab',
        scope: 'my-lifting-lab-s-projects' }, { signal })
      return { status: 'SURFACES_ENABLED_VERIFIED', deployment: { target: held.target, ...result } }
    },
  }
  const built = joined.createStagingGeneration23SurfaceFactory({ credentials, fetch: async () => {}, runCli: async () => {}, execute: async () => {},
    preflight: { heldEvidence: held, requirements }, preview: { enabledJournal: previewJournals[0], heldJournal: previewJournals[1],
      runBuild: async ({ input, journal }) => {
        const result = { status: 'PROTECTED_PREVIEW_VERIFIED', deploymentId: 'dpl_enabledA', immutableUrl: 'https://enabled-a.vercel.app',
          sourceCommit: input.sourceCommit, manifestSha256: input.manifestSha256, customerEnabled: input.publicCustomer, cartEnabled: input.publicCart }
        journal.set({ phase: 'VERIFIED', deploymentId: result.deploymentId, sourceCommit: input.sourceCommit,
          manifestSha256: input.manifestSha256, publicCustomer: input.publicCustomer, publicCart: input.publicCart })
        return result
      } }, journals: { enableSurface: {}, freezeSurface: {}, checkoutEnable: {}, checkoutFreeze: {} }, checkoutTarget: target,
    readVariantPrice: async () => ({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED', variantId: joined.STAGING_GENERATION_23_SHOPIFY_VARIANT_ID, pricePence: 1999, observedAt: new Date(nowMs).toISOString() }),
    now: () => nowMs, factories })
  const result = await built.ports.enableSurface({ signal })
  assert.equal(result.status, 'SURFACES_ENABLED_VERIFIED')
  assert.equal(enabledRecord.phase, 'VERIFIED')
  assert.equal(heldRecord, null)
  built.dispose(); f.dispose()
})
