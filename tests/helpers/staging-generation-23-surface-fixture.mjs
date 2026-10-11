import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createSurfaceActivationJournal, HELD_SURFACE_FLAGS, STAGING_BRANCH, STAGING_SURFACE_TARGET } from '../../scripts/staging-surface-activation-transport.mjs'
import { createStagingSurfaceNativePorts } from '../../scripts/staging-surface-activation-native-adapter.mjs'

export const START = Date.parse('2026-09-26T12:00:00.000Z')
export const requirements = { sourceCommit: 'a'.repeat(40), manifestSha256: 'b'.repeat(64),
  observedAt: new Date(START).toISOString() }
export const held = { target: STAGING_SURFACE_TARGET, deploymentId: 'dpl_held123',
  immutableUrl: 'https://tll-held-123.vercel.app', sourceCommit: requirements.sourceCommit,
  manifestSha256: requirements.manifestSha256, ready: true,
  createdAt: new Date(START - 60_000).toISOString() }

export async function rehearsal() {
  const source = await readFile(new URL('../../scripts/staging-generation-23-whole-run.mjs', import.meta.url), 'utf8')
  const armed = source.replace('export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = false',
    'export const STAGING_GENERATION_23_WHOLE_RUN_ENABLED = true')
  assert.notEqual(armed, source)
  return import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)
}

export function surfaceFixture({ losePublicReply = false } = {}) {
  const events = []
  let flags = { ...HELD_SURFACE_FLAGS }, active = held, build = 0
  const check = value => assert.deepEqual(value, STAGING_SURFACE_TARGET)
  const response = (surface, enabled) => surface === 'edge'
    ? { target: STAGING_SURFACE_TARGET, surface, enabled }
    : { target: STAGING_SURFACE_TARGET, surface, customer: enabled, cart: enabled }
  const ports = {
    async setEdgeEnabled(target, enabled) {
      check(target); events.push(`edge:${enabled}`); flags.edge = enabled
      return response('edge', enabled)
    },
    async setVercelPrivateEnabled(target, input) {
      check(target); events.push(`private:${input.customer}`)
      flags.privateCustomer = input.customer; flags.privateCart = input.cart
      return response('private', input.customer)
    },
    async setVercelPublicEnabled(target, input) {
      check(target); events.push(`public:${input.customer}`)
      flags.publicCustomer = input.customer; flags.publicCart = input.cart
      if (losePublicReply && input.customer) throw new Error('synthetic lost response')
      return response('public', input.customer)
    },
    async readSurfaceFlags(target) { check(target); return { target, ...flags } },
    async createPreviewDeployment(target, input) {
      check(target); events.push('create')
      assert.equal(input.branch, STAGING_BRANCH)
      assert.equal(input.sourceCommit, requirements.sourceCommit)
      assert.equal(input.manifestSha256, requirements.manifestSha256)
      assert.equal(input.publicCustomer, flags.publicCustomer)
      assert.equal(input.publicCart, flags.publicCart)
      build++
      active = { ...held, deploymentId: `dpl_build${build}A`,
        immutableUrl: `https://tll-build-${build}.vercel.app`,
        createdAt: new Date(START).toISOString() }
      return { ...active }
    },
    async readDeployment(target, id) { check(target); assert.equal(id, active.deploymentId); return { ...active } },
    async resolveAlias(target, alias) { check(target); return { target, alias,
      deploymentId: active.deploymentId, immutableUrl: active.immutableUrl } },
    async probeTls(target, url) { check(target); return { target, url, tls: true } },
    async readRuntimeReadiness(target, id) { check(target); assert.equal(id, active.deploymentId)
      return { target, deploymentId: id, immutableUrl: active.immutableUrl,
        customerEnabled: flags.privateCustomer, cartEnabled: flags.privateCart,
        brokerEnabled: flags.edge, publicCustomerEnabled: flags.publicCustomer,
        publicCartEnabled: flags.publicCart } },
  }
  const journal = action => createSurfaceActivationJournal({ path: join(mkdtempSync(
    join(tmpdir(), 'tll-gen23-surface-rehearsal-')), `${action}.json`),
  makeRunId: () => `reviewed-${action}-run` })
  const nativePorts = (signal, { createDeployment } = {}) => {
    const pending = new Map()
    const write = async (target, name, value, { signal: writeSignal }) => {
      check(target); assert.equal(writeSignal, signal)
      const group = name.startsWith('NEXT_PUBLIC_') ? 'public' : 'private'
      pending.set(name, value)
      const names = group === 'public'
        ? ['NEXT_PUBLIC_TLL_STAGING_CUSTOMER', 'NEXT_PUBLIC_TLL_STAGING_CART']
        : ['TLL_STAGING_CUSTOMER_ENABLED', 'TLL_STAGING_CART_ENABLED']
      if (names.every(item => pending.has(item))) {
        const expected = group === 'public' ? 'enabled' : 'true'
        assert.equal(pending.get(names[0]), pending.get(names[1]))
        await (group === 'public' ? ports.setVercelPublicEnabled : ports.setVercelPrivateEnabled)(
          STAGING_SURFACE_TARGET, { customer: value === expected, cart: value === expected })
        names.forEach(item => pending.delete(item))
      }
    }
    return createStagingSurfaceNativePorts({
      execute: async operation => ({ status: 'COMPLETED', value: await operation(signal) }),
      setVercelFlag: write,
      setEdgeFlag: async (target, functionName, enabled) => {
        assert.equal(functionName, 'customer-subject-broker')
        await ports.setEdgeEnabled(target, enabled)
        return { target, functionName, enabled }
      },
      readEdgeFlag: async target => ({ target, functionName: 'customer-subject-broker',
        enabled: (await ports.readSurfaceFlags(target)).edge }),
      readVercelFlags: async target => {
        const flags = await ports.readSurfaceFlags(target)
        return { target, privateCustomer: flags.privateCustomer, privateCart: flags.privateCart,
          publicCustomer: flags.publicCustomer, publicCart: flags.publicCart }
      },
      createDeployment: async (target, input) => {
        const { project, scope, ...deploymentInput } = input
        assert.equal(project, 'the-lifting-lab')
        assert.equal(scope, 'my-lifting-lab-s-projects')
        const identity = { ...await (createDeployment
          ? createDeployment(target, input, { signal })
          : ports.createPreviewDeployment(target, deploymentInput)) }
        delete identity.target
        return identity
      },
      readDeployment: async (target, id) => {
        const identity = { ...await ports.readDeployment(target, id) }
        delete identity.target
        return identity
      },
      resolveAlias: async (target, input) => ports.resolveAlias(target, input.alias),
      fetch: async (url, options) => {
        if (options.method === 'HEAD') return { status: (await ports.probeTls(STAGING_SURFACE_TARGET, url)).tls ? 200 : 500 }
        const id = options.headers['x-tll-deployment-id']
        const ready = await ports.readRuntimeReadiness(STAGING_SURFACE_TARGET, id)
        assert.equal(url, `${ready.immutableUrl}/api/staging/readiness`)
        return { status: 200, json: async () => ({ deploymentId: id, immutableUrl: ready.immutableUrl,
          projectRef: STAGING_SURFACE_TARGET.projectRef, branch: STAGING_BRANCH,
          privateCustomer: ready.customerEnabled, privateCart: ready.cartEnabled,
          publicCustomer: ready.publicCustomerEnabled, publicCart: ready.publicCartEnabled }) }
      },
    })
  }
  return { ports, nativePorts, events, journal }
}
