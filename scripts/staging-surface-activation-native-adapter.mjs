/** Fixed injected-only adapter. No credential lookup, launcher, or ambient transport. */
import {
  HELD_SURFACE_FLAGS,
  PRODUCTION_PROJECT_REF,
  STAGING_ALIAS,
  STAGING_BRANCH,
  STAGING_PROJECT_REF,
  STAGING_SURFACE_TARGET,
} from './staging-surface-activation-transport.mjs'

export const NATIVE_SURFACE_ACTIVATION_ADAPTER_ENABLED = false
export const VERCEL_PROJECT = 'the-lifting-lab'
export const VERCEL_SCOPE = 'my-lifting-lab-s-projects'
export const STAGING_EDGE_FUNCTION = 'customer-subject-broker'

const unavailable = () => { throw new Error('Staging surface native adapter unavailable') }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

function validateTarget(value) {
  if (!same(value, STAGING_SURFACE_TARGET) || value.projectRef === PRODUCTION_PROJECT_REF) unavailable()
  return STAGING_SURFACE_TARGET
}

export function surfaceFlagProjection(value) {
  if (!exact(value, Object.keys(HELD_SURFACE_FLAGS)) || Object.values(value).some(item => typeof item !== 'boolean')) unavailable()
  return Object.freeze({ ...value })
}

const flagNames = Object.freeze({
  privateCustomer: 'TLL_STAGING_CUSTOMER_ENABLED', privateCart: 'TLL_STAGING_CART_ENABLED',
  publicCustomer: 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER', publicCart: 'NEXT_PUBLIC_TLL_STAGING_CART',
})
const vercelCommand = args => ['--yes', 'vercel', ...args, '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE, '--non-interactive', '--no-color']
const writeCommand = name => vercelCommand(['env', 'add', name, 'preview', '--git-branch', STAGING_BRANCH, '--no-sensitive', '--force'])

function validateIdentity(value, requirements) {
  if (!exact(value, ['deploymentId', 'immutableUrl', 'sourceCommit', 'manifestSha256', 'ready', 'createdAt'])
    || !/^dpl_[A-Za-z0-9]+$/.test(value.deploymentId ?? '')
    || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value.immutableUrl ?? '')
    || value.ready !== true || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.createdAt ?? '')
    || (requirements && (value.sourceCommit !== requirements.sourceCommit || value.manifestSha256 !== requirements.manifestSha256))) unavailable()
  return Object.freeze({ target: STAGING_SURFACE_TARGET, ...value })
}

function validateEdgeProof(value) {
  if (!exact(value, ['target', 'functionName', 'enabled']) || !same(value.target, STAGING_SURFACE_TARGET)
    || value.functionName !== STAGING_EDGE_FUNCTION || typeof value.enabled !== 'boolean') unavailable()
  return value
}

function validateWebProof(value) {
  if (!exact(value, ['target', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
    || !same(value.target, STAGING_SURFACE_TARGET)
    || [value.privateCustomer, value.privateCart, value.publicCustomer, value.publicCart].some(item => typeof item !== 'boolean')) unavailable()
  return value
}

async function invokeBounded(execute, operation) {
  let result
  try {
    result = await execute(async signal => {
      if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
      return operation(signal)
    })
  } catch { unavailable() }
  if (!exact(result, ['status', 'value']) || result.status !== 'COMPLETED') unavailable()
  return result.value
}

/** Build only the exact ports consumed by the reviewed surface state machine. */
export function createStagingSurfaceNativePorts({
  execute, runVercel, setEdgeFlag, readEdgeFlag, readVercelFlags,
  createDeployment, readDeployment, resolveAlias, fetch: fetcher,
} = {}) {
  if ([execute, runVercel, setEdgeFlag, readEdgeFlag, readVercelFlags, createDeployment, readDeployment, resolveAlias, fetcher]
    .some(operation => typeof operation !== 'function')) unavailable()
  const call = (operation, ...args) => invokeBounded(execute, signal => operation(...args, { signal }))
  const deployments = new Map()
  const write = async (name, value) => {
    const bytes = Buffer.from(value)
    try { await call(runVercel, writeCommand(name), bytes, 0) } finally { bytes.fill(0) }
  }

  return Object.freeze({
    async setEdgeEnabled(value, enabled) {
      validateTarget(value); if (typeof enabled !== 'boolean') unavailable()
      const proof = validateEdgeProof(await call(setEdgeFlag, STAGING_SURFACE_TARGET, STAGING_EDGE_FUNCTION, enabled))
      if (proof.enabled !== enabled) unavailable()
      return Object.freeze({ target: STAGING_SURFACE_TARGET, surface: 'edge', enabled })
    },
    async setVercelPrivateEnabled(value, input) {
      validateTarget(value)
      if (!exact(input, ['customer', 'cart']) || typeof input.customer !== 'boolean' || input.customer !== input.cart) unavailable()
      await write(flagNames.privateCustomer, input.customer ? 'true' : 'false')
      await write(flagNames.privateCart, input.cart ? 'true' : 'false')
      return Object.freeze({ target: STAGING_SURFACE_TARGET, surface: 'private', customer: input.customer, cart: input.cart })
    },
    async setVercelPublicEnabled(value, input) {
      validateTarget(value)
      if (!exact(input, ['customer', 'cart']) || typeof input.customer !== 'boolean' || input.customer !== input.cart) unavailable()
      await write(flagNames.publicCustomer, input.customer ? 'enabled' : 'disabled')
      await write(flagNames.publicCart, input.cart ? 'enabled' : 'disabled')
      return Object.freeze({ target: STAGING_SURFACE_TARGET, surface: 'public', customer: input.customer, cart: input.cart })
    },
    async readSurfaceFlags(value) {
      validateTarget(value)
      const [edge, web] = await Promise.all([
        call(readEdgeFlag, STAGING_SURFACE_TARGET, STAGING_EDGE_FUNCTION),
        call(readVercelFlags, STAGING_SURFACE_TARGET, flagNames),
      ])
      validateEdgeProof(edge); validateWebProof(web)
      return Object.freeze({ target: STAGING_SURFACE_TARGET, edge: edge.enabled,
        privateCustomer: web.privateCustomer, privateCart: web.privateCart,
        publicCustomer: web.publicCustomer, publicCart: web.publicCart })
    },
    async createPreviewDeployment(value, input) {
      validateTarget(value)
      if (!exact(input, ['branch', 'sourceCommit', 'manifestSha256', 'publicCustomer', 'publicCart'])
        || input.branch !== STAGING_BRANCH || !/^[a-f0-9]{40}$/.test(input.sourceCommit)
        || !/^[a-f0-9]{64}$/.test(input.manifestSha256)
        || typeof input.publicCustomer !== 'boolean' || typeof input.publicCart !== 'boolean') unavailable()
      const request = Object.freeze({ ...input, project: VERCEL_PROJECT, scope: VERCEL_SCOPE })
      const result = validateIdentity(await call(createDeployment, STAGING_SURFACE_TARGET, request), input)
      deployments.set(result.deploymentId, result.immutableUrl); return result
    },
    async readDeployment(value, deploymentId) {
      validateTarget(value); if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? '')) unavailable()
      const result = validateIdentity(await call(readDeployment, STAGING_SURFACE_TARGET, deploymentId))
      if (result.deploymentId !== deploymentId) unavailable()
      deployments.set(deploymentId, result.immutableUrl); return result
    },
    async resolveAlias(value, alias) {
      validateTarget(value); if (alias !== STAGING_ALIAS) unavailable()
      const request = Object.freeze({ project: VERCEL_PROJECT, scope: VERCEL_SCOPE, alias: STAGING_ALIAS, branch: STAGING_BRANCH })
      const result = await call(resolveAlias, STAGING_SURFACE_TARGET, request)
      if (!exact(result, ['target', 'alias', 'deploymentId', 'immutableUrl']) || !same(result.target, STAGING_SURFACE_TARGET)
        || result.alias !== STAGING_ALIAS || !/^dpl_[A-Za-z0-9]+$/.test(result.deploymentId ?? '')
        || !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(result.immutableUrl ?? '')) unavailable()
      return Object.freeze(result)
    },
    async probeTls(value, url) {
      validateTarget(value)
      if (url !== STAGING_ALIAS && !/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(url ?? '')) unavailable()
      const response = await invokeBounded(execute, signal => fetcher(url, { method: 'HEAD', redirect: 'manual', signal }))
      if (!response || !Number.isInteger(response.status) || response.status < 200 || response.status > 299) unavailable()
      return Object.freeze({ target: STAGING_SURFACE_TARGET, url, tls: true })
    },
    async readRuntimeReadiness(value, deploymentId) {
      validateTarget(value); if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId ?? '')) unavailable()
      let immutableUrl = deployments.get(deploymentId)
      if (!immutableUrl) {
        const proof = validateIdentity(await call(readDeployment, STAGING_SURFACE_TARGET, deploymentId))
        if (proof.deploymentId !== deploymentId) unavailable()
        immutableUrl = proof.immutableUrl; deployments.set(deploymentId, immutableUrl)
      }
      const ready = await invokeBounded(execute, async signal => {
        const response = await fetcher(`${immutableUrl}/api/staging/readiness`, {
          method: 'GET', redirect: 'error', headers: { 'x-tll-deployment-id': deploymentId }, signal,
        })
        if (!response || response.status !== 200 || typeof response.json !== 'function') unavailable()
        return response.json()
      })
      if (!exact(ready, ['deploymentId', 'immutableUrl', 'projectRef', 'branch', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
        || ready.deploymentId !== deploymentId || ready.immutableUrl !== immutableUrl
        || ready.projectRef !== STAGING_PROJECT_REF || ready.branch !== STAGING_BRANCH) unavailable()
      validateWebProof({ target: STAGING_SURFACE_TARGET, privateCustomer: ready.privateCustomer, privateCart: ready.privateCart,
        publicCustomer: ready.publicCustomer, publicCart: ready.publicCart })
      const edge = validateEdgeProof(await call(readEdgeFlag, STAGING_SURFACE_TARGET, STAGING_EDGE_FUNCTION))
      return Object.freeze({ target: STAGING_SURFACE_TARGET, deploymentId, immutableUrl,
        customerEnabled: ready.privateCustomer, cartEnabled: ready.privateCart, brokerEnabled: edge.enabled,
        publicCustomerEnabled: ready.publicCustomer, publicCartEnabled: ready.publicCart })
    },
  })
}
