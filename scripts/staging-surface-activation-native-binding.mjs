/**
 * Concrete, injected-only dependencies for the disabled surface adapter.
 * This module deliberately has no launcher, credential lookup, or ambient I/O.
 */
import {
  PRODUCTION_PROJECT_REF,
  STAGING_ALIAS,
  STAGING_BRANCH,
  STAGING_PROJECT_REF,
  STAGING_SURFACE_TARGET,
} from './staging-surface-activation-transport.mjs'
import { STAGING_EDGE_FUNCTION } from './staging-surface-activation-native-adapter.mjs'

export const NATIVE_SURFACE_ACTIVATION_BINDING_ENABLED = false
export const VERCEL_PROJECT_ID = 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4'
export const VERCEL_PROJECT = 'the-lifting-lab'
export const VERCEL_SCOPE = 'my-lifting-lab-s-projects'
export const VERCEL_TEAM_ID = 'team_gf7cgIkkoeMLtODFDDT5MrW4'
export const EDGE_FLAG_NAME = 'TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'
const VERCEL_API = 'https://api.vercel.com'
const EDGE_TOKEN_URL = `https://${STAGING_PROJECT_REF}.supabase.co/functions/v1/tll-broker-token`
const MAX_RESPONSE_BYTES = 64 * 1024
const STAGING_ALIAS_HOST = new URL(STAGING_ALIAS).hostname

const unavailable = () => { throw new Error('Staging surface native binding unavailable') }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const validDeploymentId = value => typeof value === 'string' && /^dpl_[A-Za-z0-9]+$/.test(value)
const validUrl = value => typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value)

function validateTarget(value) {
  if (!same(value, STAGING_SURFACE_TARGET) || value.projectRef === PRODUCTION_PROJECT_REF) unavailable()
  return STAGING_SURFACE_TARGET
}
function validateSignal(signal) {
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function' || signal.aborted) unavailable()
}
function validateRunnerReceipt(value) {
  if (!exact(value, ['status']) || value.status !== 'COMPLETED') unavailable()
}
function validateVercelToken(value) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > 1024 || value.includes(0)) unavailable()
  return value
}
function headersForVercel(token) {
  // The header is transient and is never included in a receipt or error.
  return Object.freeze({ accept: 'application/json', authorization: `Bearer ${token.toString('utf8')}` })
}
function checkResponse(response, url, expectedStatus) {
  if (!response || !Number.isInteger(response.status) || response.redirected === true
    || response.status !== expectedStatus || (typeof response.url === 'string' && response.url !== '' && response.url !== url)) unavailable()
}
async function json(response, url, expectedStatus) {
  checkResponse(response, url, expectedStatus)
  if (!response.body || typeof response.body.getReader !== 'function') unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      const item = await reader.read()
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array)) unavailable()
      size += item.value.byteLength
      if (size > MAX_RESPONSE_BYTES) {
        item.value.fill(0)
        try { await reader.cancel() } catch {}
        unavailable()
      }
      const copy = Buffer.from(item.value); item.value.fill(0); chunks.push(copy)
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } catch { unavailable() } finally {
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}
async function settled(operation) { try { return await operation() } catch { unavailable() } }
function cliCommandForVercel(args, bytes) {
  const names = Object.freeze({
    TLL_STAGING_CUSTOMER_ENABLED: ['true', 'false'],
    TLL_STAGING_CART_ENABLED: ['true', 'false'],
    NEXT_PUBLIC_TLL_STAGING_CUSTOMER: ['enabled', 'disabled'],
    NEXT_PUBLIC_TLL_STAGING_CART: ['enabled', 'disabled'],
  })
  if (!Array.isArray(args) || args.some(item => typeof item !== 'string') || !Buffer.isBuffer(bytes)) unavailable()
  const name = args[4]
  const expected = ['--yes', 'vercel', 'env', 'add', name, 'preview', '--git-branch', STAGING_BRANCH, '--no-sensitive', '--force',
    '--project', VERCEL_PROJECT, '--scope', VERCEL_SCOPE, '--non-interactive', '--no-color']
  if (!Object.hasOwn(names, name) || !same(args, expected) || !names[name].includes(bytes.toString('utf8'))) unavailable()
}
function edgeCommand(enabled) {
  return Object.freeze({
    args: Object.freeze(['supabase', 'secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', STAGING_PROJECT_REF, '--output', 'json']),
    input: Buffer.from(`${EDGE_FLAG_NAME}=${enabled ? 'true' : 'false'}\n`),
  })
}
function sourceMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.githubCommitRef !== STAGING_BRANCH
    || !/^[a-f0-9]{40}$/.test(value.githubCommitSha ?? '') || !/^[a-f0-9]{64}$/.test(value.tllManifestSha256 ?? '')) unavailable()
  return value
}
function deploymentReceipt(value, deploymentId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || value.id !== deploymentId || !validUrl(`https://${value.url ?? ''}`) || value.projectId !== VERCEL_PROJECT_ID
    || value.ownerId !== VERCEL_TEAM_ID || value.readyState !== 'READY' || !Number.isFinite(value.createdAt)) unavailable()
  const meta = sourceMetadata(value.meta)
  return Object.freeze({ deploymentId, immutableUrl: `https://${value.url}`,
    sourceCommit: meta.githubCommitSha, manifestSha256: meta.tllManifestSha256, ready: true,
    createdAt: new Date(value.createdAt).toISOString() })
}
function aliasReceipt(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value.alias !== STAGING_ALIAS_HOST
    || value.projectId !== VERCEL_PROJECT_ID || !validDeploymentId(value.deploymentId)
    || !value.deployment || typeof value.deployment !== 'object' || value.deployment.id !== value.deploymentId
    || !validUrl(`https://${value.deployment.url ?? ''}`)) unavailable()
  const keys = Object.keys(value.deployment)
  if (!keys.every(key => ['id', 'url', 'meta'].includes(key)) || (value.deployment.meta !== undefined
    && (!value.deployment.meta || typeof value.deployment.meta !== 'object' || Array.isArray(value.deployment.meta)
      || Object.keys(value.deployment.meta).length > 128 || Object.entries(value.deployment.meta).some(([key, item]) => !/^[A-Za-z0-9_.-]{1,128}$/.test(key) || typeof item !== 'string' || item.length > 1024)))) unavailable()
  return Object.freeze({ target: STAGING_SURFACE_TARGET, alias: STAGING_ALIAS,
    deploymentId: value.deploymentId, immutableUrl: `https://${value.deployment.url}` })
}

/**
 * Return the host-operation dependencies accepted by createStagingSurfaceNativePorts.
 * runCli and fetch are mandatory injected, abort-aware functions. No operation has a
 * default implementation, so importing this module cannot contact either provider.
 */
export function createStagingSurfaceNativeBinding({ runCli, fetch: fetcher, vercelToken } = {}) {
  if (typeof runCli !== 'function' || typeof fetcher !== 'function') unavailable()
  const token = validateVercelToken(vercelToken)
  const deployments = new Map()
  const readPinnedRepository = async signal => {
    validateSignal(signal)
    let reader
    try {
      // The existing baseline reader imports this module's fixed target constants;
      // load it after module initialization to avoid a circular ESM initializer.
      const { createStagingAccountHostedBaselineVercelBinding } = await import('./staging-account-hosted-baseline-vercel.mjs')
      reader = createStagingAccountHostedBaselineVercelBinding({ fetch: fetcher, vercelToken: token })
      const project = await reader.readProject({ signal })
      const repository = project.repository
      if (repository.repoId !== 1264363509 || repository.org !== 'tntipper'
        || repository.repo !== 'the-lifting-lab' || repository.sourceless !== false) unavailable()
      return Object.freeze({ repoId: repository.repoId, org: repository.org, repo: repository.repo })
    } catch { unavailable() } finally { reader?.dispose() }
  }
  const withSignal = (signal, operation) => {
    validateSignal(signal)
    return operation()
  }
  const fetchJson = async (url, options) => {
    const response = await settled(() => fetcher(url, options))
    return json(response, url, 200)
  }
  const boundFetch = async (url, options) => {
    validateSignal(options?.signal)
    const immutableUrl = [...deployments.entries()].find(([, knownUrl]) => knownUrl === url)?.[1]
    const readiness = [...deployments.entries()].find(([, knownUrl]) => `${knownUrl}/api/staging/readiness` === url)
    const headAllowed = (url === STAGING_ALIAS || immutableUrl) && exact(options, ['method', 'redirect', 'signal'])
      && options.method === 'HEAD' && options.redirect === 'manual'
    const readinessAllowed = readiness && exact(options, ['method', 'redirect', 'headers', 'signal'])
      && options.method === 'GET' && options.redirect === 'error' && exact(options.headers, ['x-tll-deployment-id'])
      && options.headers['x-tll-deployment-id'] === readiness[0]
    if (!headAllowed && !readinessAllowed) unavailable()
    const response = await settled(() => fetcher(url, options))
    if (!response || typeof response !== 'object') unavailable()
    // The adapter's readiness parser receives the same bounded body parser.
    return Object.freeze({ status: response.status, url: response.url, redirected: response.redirected, headers: response.headers,
      json: () => json(response, url, 200) })
  }
  const resolveAlias = async (_target, request, { signal } = {}) => {
    validateTarget(_target)
    if (!exact(request, ['project', 'scope', 'alias', 'branch']) || request.project !== VERCEL_PROJECT
      || request.scope !== VERCEL_SCOPE || request.alias !== STAGING_ALIAS || request.branch !== STAGING_BRANCH) unavailable()
    const url = `${VERCEL_API}/v4/aliases/${STAGING_ALIAS_HOST}?projectId=${VERCEL_PROJECT_ID}&teamId=${VERCEL_TEAM_ID}`
    const value = await withSignal(signal, () => fetchJson(url, Object.freeze({ method: 'GET', redirect: 'error', headers: headersForVercel(token), signal })))
    const receipt = aliasReceipt(value); deployments.set(receipt.deploymentId, receipt.immutableUrl)
    return receipt
  }
  return Object.freeze({
    // The adapter owns the two fixed TLS probes; this wrapper only normalizes
    // an injected transport failure after its request has settled.
    fetch: boundFetch,
    async runVercel(args, bytes, inputFd, { signal } = {}) {
      validateSignal(signal); if (inputFd !== 0) unavailable(); cliCommandForVercel(args, bytes)
      validateRunnerReceipt(await settled(() => runCli(args, bytes, inputFd, { signal })))
    },
    async setEdgeFlag(target, functionName, enabled, { signal } = {}) {
      validateTarget(target); validateSignal(signal)
      if (functionName !== STAGING_EDGE_FUNCTION || typeof enabled !== 'boolean') unavailable()
      const command = edgeCommand(enabled)
      try { validateRunnerReceipt(await settled(() => runCli(command.args, command.input, 3, { signal }))) }
      finally { command.input.fill(0) }
      return Object.freeze({ target: STAGING_SURFACE_TARGET, functionName: STAGING_EDGE_FUNCTION, enabled })
    },
    async readEdgeFlag(target, functionName, { signal } = {}) {
      validateTarget(target); validateSignal(signal); if (functionName !== STAGING_EDGE_FUNCTION) unavailable()
      const response = await settled(() => fetcher(EDGE_TOKEN_URL, Object.freeze({ method: 'POST', redirect: 'error', headers: Object.freeze({ accept: 'application/json' }), signal })))
      const expectedStatus = response?.status === 503 ? 503 : response?.status === 401 ? 401 : -1
      const value = await json(response, EDGE_TOKEN_URL, expectedStatus)
      if (response.status === 503 && exact(value, ['error']) && value.error === 'temporarily_unavailable') return Object.freeze({ target: STAGING_SURFACE_TARGET, functionName, enabled: false })
      if (response.status === 401 && exact(value, ['error']) && value.error === 'invalid_client') return Object.freeze({ target: STAGING_SURFACE_TARGET, functionName, enabled: true })
      unavailable()
    },
    async readVercelFlags(target, names, { signal } = {}) {
      validateTarget(target); validateSignal(signal)
      if (!exact(names, ['privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
        || names.privateCustomer !== 'TLL_STAGING_CUSTOMER_ENABLED' || names.privateCart !== 'TLL_STAGING_CART_ENABLED'
        || names.publicCustomer !== 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER' || names.publicCart !== 'NEXT_PUBLIC_TLL_STAGING_CART') unavailable()
      const alias = await resolveAlias(target, Object.freeze({ project: VERCEL_PROJECT, scope: VERCEL_SCOPE, alias: STAGING_ALIAS, branch: STAGING_BRANCH }), { signal })
      const url = `${alias.immutableUrl}/api/staging/readiness`
      const value = await fetchJson(url, Object.freeze({ method: 'GET', redirect: 'error', headers: Object.freeze({ 'x-tll-deployment-id': alias.deploymentId }), signal }))
      if (!exact(value, ['deploymentId', 'immutableUrl', 'projectRef', 'branch', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
        || value.deploymentId !== alias.deploymentId || value.immutableUrl !== alias.immutableUrl || value.projectRef !== STAGING_PROJECT_REF || value.branch !== STAGING_BRANCH
        || [value.privateCustomer, value.privateCart, value.publicCustomer, value.publicCart].some(item => typeof item !== 'boolean')) unavailable()
      return Object.freeze({ target: STAGING_SURFACE_TARGET, privateCustomer: value.privateCustomer, privateCart: value.privateCart,
        publicCustomer: value.publicCustomer, publicCart: value.publicCart })
    },
    async createDeployment() { unavailable() },
    // This must be called anew inside the eventual POST operation; a saved
    // receipt cannot prove that the connected repository is still unchanged.
    readPinnedRepository,
    async readDeploymentState(target, deploymentId, { signal } = {}) {
      validateTarget(target); validateSignal(signal); if (!validDeploymentId(deploymentId)) unavailable()
      const url = `${VERCEL_API}/v13/deployments/${deploymentId}?teamId=${VERCEL_TEAM_ID}`
      const value = await fetchJson(url, Object.freeze({ method: 'GET', redirect: 'error', headers: headersForVercel(token), signal }))
      if (!value || typeof value !== 'object' || Array.isArray(value) || value.id !== deploymentId
        || !['QUEUED', 'INITIALIZING', 'BUILDING', 'READY', 'ERROR'].includes(value.readyState)
        || (value.projectId !== undefined && value.projectId !== VERCEL_PROJECT_ID)
        || (value.ownerId !== undefined && value.ownerId !== VERCEL_TEAM_ID)
        || (value.target !== undefined && value.target !== null)) unavailable()
      return Object.freeze({ deploymentId, readyState: value.readyState })
    },
    async readDeployment(target, deploymentId, { signal } = {}) {
      validateTarget(target); validateSignal(signal); if (!validDeploymentId(deploymentId)) unavailable()
      const url = `${VERCEL_API}/v13/deployments/${deploymentId}?teamId=${VERCEL_TEAM_ID}`
      const value = await fetchJson(url, Object.freeze({ method: 'GET', redirect: 'error', headers: headersForVercel(token), signal }))
      const receipt = deploymentReceipt(value, deploymentId); deployments.set(deploymentId, receipt.immutableUrl)
      return receipt
    },
    resolveAlias,
  })
}
