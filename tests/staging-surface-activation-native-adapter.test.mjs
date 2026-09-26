import test from 'node:test'
import assert from 'node:assert/strict'
import { createStagingSurfaceNativePorts, NATIVE_SURFACE_ACTIVATION_ADAPTER_ENABLED } from '../scripts/staging-surface-activation-native-adapter.mjs'
import { enableStagingSurfaces, freezeStagingSurfaces, HELD_SURFACE_FLAGS, STAGING_ALIAS, STAGING_SURFACE_TARGET } from '../scripts/staging-surface-activation-transport.mjs'

const sourceCommit = 'a'.repeat(40), manifestSha256 = 'b'.repeat(64)
const requirements = { sourceCommit, manifestSha256, observedAt: '2026-09-22T12:00:00.000Z' }
const oldDeployment = { target: STAGING_SURFACE_TARGET, deploymentId: 'dpl_old123', immutableUrl: 'https://old-123.vercel.app',
  sourceCommit, manifestSha256, ready: true, createdAt: '2026-09-22T11:59:00.000Z' }
const completedExecutor = async operation => ({ status: 'COMPLETED', value: await operation(new AbortController().signal) })

function journal() {
  let state
  return { read: () => state, recordIntent: () => (state = { runId: 'abcdefgh', state: 'INTENT_RECORDED' }),
    transition: (intent, next) => (state = { ...intent, state: next }) }
}

function hostedFixture() {
  const state = { flags: { ...HELD_SURFACE_FLAGS }, counter: 0, currentId: oldDeployment.deploymentId,
    deployments: new Map([[oldDeployment.deploymentId, oldDeployment]]), calls: [] }
  const makePorts = ({ execute = completedExecutor, edgeAck } = {}) => createStagingSurfaceNativePorts({
    execute,
    runVercel: async (args, bytes, _fd, { signal }) => {
      assert.equal(signal.aborted, false); state.calls.push(['vercel', args])
      const name = args[args.indexOf('add') + 1], value = bytes.toString()
      if (name === 'TLL_STAGING_CUSTOMER_ENABLED') state.flags.privateCustomer = value === 'true'
      if (name === 'TLL_STAGING_CART_ENABLED') state.flags.privateCart = value === 'true'
      if (name === 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER') state.flags.publicCustomer = value === 'enabled'
      if (name === 'NEXT_PUBLIC_TLL_STAGING_CART') state.flags.publicCart = value === 'enabled'
    },
    setEdgeFlag: async (target, functionName, enabled, { signal }) => {
      assert.equal(signal.aborted, false); state.flags.edge = enabled
      return { target, functionName, enabled: edgeAck ?? enabled }
    },
    readEdgeFlag: async (target, functionName, { signal }) => {
      assert.equal(signal.aborted, false); return { target, functionName, enabled: state.flags.edge }
    },
    readVercelFlags: async (target, _names, { signal }) => {
      assert.equal(signal.aborted, false)
      return { target, privateCustomer: state.flags.privateCustomer, privateCart: state.flags.privateCart,
        publicCustomer: state.flags.publicCustomer, publicCart: state.flags.publicCart }
    },
    createDeployment: async (_target, _input, { signal }) => {
      assert.equal(signal.aborted, false); state.counter += 1
      const value = { deploymentId: `dpl_new${state.counter}x`, immutableUrl: `https://new-${state.counter}.vercel.app`,
        sourceCommit, manifestSha256, ready: true, createdAt: requirements.observedAt }
      state.deployments.set(value.deploymentId, value); state.currentId = value.deploymentId; return value
    },
    readDeployment: async (_target, deploymentId, { signal }) => {
      assert.equal(signal.aborted, false); state.calls.push(['readDeployment', deploymentId])
      return state.deployments.get(deploymentId)
    },
    resolveAlias: async (_target, _input, { signal }) => {
      assert.equal(signal.aborted, false); const current = state.deployments.get(state.currentId)
      return { target: STAGING_SURFACE_TARGET, alias: STAGING_ALIAS, deploymentId: current.deploymentId, immutableUrl: current.immutableUrl }
    },
    fetch: async (url, options) => {
      assert.equal(options.signal.aborted, false)
      if (!url.endsWith('/api/staging/readiness')) return { status: 200 }
      const current = [...state.deployments.values()].find(item => `${item.immutableUrl}/api/staging/readiness` === url)
      return { status: 200, json: async () => ({ deploymentId: current.deploymentId, immutableUrl: current.immutableUrl,
        projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
        privateCustomer: state.flags.privateCustomer, privateCart: state.flags.privateCart,
        publicCustomer: state.flags.publicCustomer, publicCart: state.flags.publicCart }) }
    },
  })
  return { state, makePorts }
}

test('native adapter is disabled and rejects missing injected operations', () => {
  assert.equal(NATIVE_SURFACE_ACTIVATION_ADAPTER_ENABLED, false)
  assert.throws(() => createStagingSurfaceNativePorts(), /unavailable/)
})

test('ports satisfy freeze then fresh-process enable with exact target-bound receipts', async () => {
  const fixture = hostedFixture(), now = () => Date.parse(requirements.observedAt), freezeJournal = journal()
  const frozen = await freezeStagingSurfaces({ ports: fixture.makePorts(), currentEvidence: oldDeployment, requirements, journal: freezeJournal, now })
  assert.equal(frozen.status, 'SURFACES_HELD_VERIFIED'); assert.equal(freezeJournal.read().state, 'FREEZE_VERIFIED')
  const enableJournal = journal()
  const enabled = await enableStagingSurfaces({ ports: fixture.makePorts(), heldEvidence: frozen.deployment, requirements, journal: enableJournal, now })
  assert.equal(enabled.status, 'SURFACES_ENABLED_VERIFIED'); assert.equal(enableJournal.read().state, 'ENABLE_VERIFIED')
  assert.ok(fixture.state.calls.filter(([kind]) => kind === 'vercel').every(([, args]) =>
    args.includes('--project') && args.includes('the-lifting-lab') && args.includes('--scope') && args.includes('my-lifting-lab-s-projects')))
})

test('target, branch, invalid runtime ID and alias drift fail before dependencies', async () => {
  const fixture = hostedFixture(), ports = fixture.makePorts(), before = fixture.state.calls.length
  await assert.rejects(ports.setEdgeEnabled({ ...STAGING_SURFACE_TARGET, projectRef: 'wrhgscovsgsudtedbljr' }, true), /unavailable/)
  await assert.rejects(ports.createPreviewDeployment(STAGING_SURFACE_TARGET, { branch: 'main', sourceCommit, manifestSha256, publicCustomer: false, publicCart: false }), /unavailable/)
  await assert.rejects(ports.readRuntimeReadiness(STAGING_SURFACE_TARGET, '../../unexpected'), /unavailable/)
  await assert.rejects(ports.resolveAlias(STAGING_SURFACE_TARGET, 'https://evil.example'), /unavailable/)
  assert.equal(fixture.state.calls.length, before)
})

test('opposite Edge acknowledgement and malformed TLS response fail closed', async () => {
  const fixture = hostedFixture()
  await assert.rejects(fixture.makePorts({ edgeAck: false }).setEdgeEnabled(STAGING_SURFACE_TARGET, true), /unavailable/)
  const noop = async () => ({}), malformed = createStagingSurfaceNativePorts({ execute: completedExecutor,
    runVercel: noop, setEdgeFlag: noop, readEdgeFlag: noop, readVercelFlags: noop,
    createDeployment: noop, readDeployment: noop, resolveAlias: noop, fetch: async () => ({}) })
  await assert.rejects(malformed.probeTls(STAGING_SURFACE_TARGET, oldDeployment.immutableUrl), /unavailable/)
})

test('cancelled mutation settles before rejection and a cancelled read never becomes evidence', async () => {
  let mutationSettled = false
  const execute = async operation => {
    const controller = new AbortController(), pending = operation(controller.signal)
    controller.abort(); await pending
    return { status: 'CANCELLED', value: null }
  }
  const waitForAbort = async (_target, _name, _enabled, { signal }) => new Promise(resolve =>
    signal.addEventListener('abort', () => { mutationSettled = true; resolve({ target: STAGING_SURFACE_TARGET,
      functionName: 'customer-subject-broker', enabled: true }) }, { once: true }))
  const noop = async () => ({})
  const ports = createStagingSurfaceNativePorts({ execute, runVercel: noop, setEdgeFlag: waitForAbort, readEdgeFlag: noop,
    readVercelFlags: noop, createDeployment: noop, readDeployment: noop, resolveAlias: noop, fetch: noop })
  await assert.rejects(ports.setEdgeEnabled(STAGING_SURFACE_TARGET, true), /unavailable/)
  assert.equal(mutationSettled, true)
  await assert.rejects(ports.readSurfaceFlags(STAGING_SURFACE_TARGET), /unavailable/)
})
