/**
 * One fresh, read-only producer for the facts consumed by the fixed Gen23
 * worker.  It deliberately does not discover credentials, create a journal,
 * or arm any downstream operation.  A reviewed parent supplies three private
 * buffers and an already-fixed Git source reader only during a read window.
 */
import { createStagingSurfaceNativeBinding, VERCEL_PROJECT_ID, VERCEL_TEAM_ID } from './staging-surface-activation-native-binding.mjs'
import { createStagingGeneration23ProtectedFetch } from './staging-generation-23-protected-fetch.mjs'
import { CHECKOUT_SETTING_NAME } from './staging-generation-23-checkout-setting.mjs'
import { HELD_SURFACE_FLAGS, MAX_FRESH_PREREQUISITE_MS, STAGING_ALIAS, STAGING_BRANCH, STAGING_SURFACE_TARGET } from './staging-surface-activation-transport.mjs'

export const STAGING_GENERATION_23_FIXED_PREFLIGHT_ENABLED = true

const unavailable = () => { throw Error('Generation 23 fixed preflight unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value)
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const token = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 4096
  && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))
const signalOk = value => value && typeof value === 'object' && value.aborted === false
  && typeof value.addEventListener === 'function' && typeof value.removeEventListener === 'function'
const iso = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value)
  && Number.isFinite(Date.parse(value))
const immutable = value => typeof value === 'string' && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(value)
const deploymentId = value => typeof value === 'string' && /^dpl_[A-Za-z0-9]+$/.test(value)
const settingId = value => typeof value === 'string' && /^[A-Za-z0-9_-]{4,128}$/.test(value)
const ENVIRONMENT_URL = `https://api.vercel.com/v10/projects/${VERCEL_PROJECT_ID}/env?target=preview&gitBranch=${encodeURIComponent(STAGING_BRANCH)}&limit=100&teamId=${VERCEL_TEAM_ID}`
const MAX_RESPONSE_BYTES = 64 * 1024

async function parseBoundedJson (response, url, signal) {
  if (!response || response.status !== 200 || response.redirected === true
    || response.url && response.url !== url || !response.body?.getReader
    || !/^application\/json(?:;|$)/i.test(response.headers?.get?.('content-type') ?? '')) unavailable()
  const length = response.headers.get('content-length'), encoding = response.headers.get('content-encoding')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)
    || encoding !== null && encoding !== '' && encoding !== 'identity') unavailable()
  const reader = response.body.getReader(), chunks = []
  let size = 0
  try {
    while (true) {
      if (signal.aborted) unavailable()
      const item = await reader.read()
      if (!item || typeof item.done !== 'boolean') unavailable()
      if (item.done) break
      if (!(item.value instanceof Uint8Array) || size + item.value.byteLength > MAX_RESPONSE_BYTES) {
        item.value?.fill?.(0); unavailable()
      }
      const copied = Buffer.from(item.value); item.value.fill(0); chunks.push(copied); size += copied.length
    }
    const bytes = Buffer.concat(chunks, size)
    try { return JSON.parse(bytes.toString('utf8')) } finally { bytes.fill(0) }
  } catch { unavailable() } finally {
    try { await reader.cancel() } catch {}
    try { reader.releaseLock() } catch {}
    for (const chunk of chunks) chunk.fill(0)
  }
}

function checkoutTargetFromInventory (value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.envs)
    || value.envs.length >= 100 || Object.hasOwn(value, 'pagination')
      && (!value.pagination || typeof value.pagination !== 'object' || value.pagination.next !== null)) unavailable()
  const matches = value.envs.filter(item => item && typeof item === 'object' && !Array.isArray(item)
    && item.key === CHECKOUT_SETTING_NAME)
  if (matches.length !== 1) unavailable()
  const item = matches[0]
  const preview = item.target === 'preview' || Array.isArray(item.target) && item.target.length === 1 && item.target[0] === 'preview'
  if (!settingId(item.id) || item.gitBranch !== STAGING_BRANCH || !preview
    || item.type !== 'encrypted' || item.visibility !== 'config') unavailable()
  return Object.freeze({ name: CHECKOUT_SETTING_NAME, id: item.id, branch: STAGING_BRANCH,
    environment: 'preview', classification: 'config' })
}

function validSourceProof (value) {
  return exact(value, ['status', 'sourceCommit', 'manifestSha256'])
    && value.status === 'SOURCE_PROOF_VERIFIED' && sha(value.sourceCommit) && digest(value.manifestSha256)
}

function heldDeployment (alias, deployment, sourceProof, now) {
  if (!exact(alias, ['target', 'alias', 'deploymentId', 'immutableUrl'])
    || alias.target !== STAGING_SURFACE_TARGET || alias.alias !== STAGING_ALIAS || !deploymentId(alias.deploymentId)
    || !immutable(alias.immutableUrl)
    || !exact(deployment, ['deploymentId', 'immutableUrl', 'sourceCommit', 'ready', 'createdAt'])
    || deployment.deploymentId !== alias.deploymentId || deployment.immutableUrl !== alias.immutableUrl
    || !sha(deployment.sourceCommit) || deployment.ready !== true || !iso(deployment.createdAt)
    || !validSourceProof(sourceProof) || sourceProof.sourceCommit !== deployment.sourceCommit
    || Date.parse(deployment.createdAt) > now) unavailable()
  return Object.freeze({ target: STAGING_SURFACE_TARGET, deploymentId: deployment.deploymentId,
    immutableUrl: deployment.immutableUrl, sourceCommit: deployment.sourceCommit,
    manifestSha256: sourceProof.manifestSha256, ready: true, createdAt: deployment.createdAt })
}

function heldRuntime (web, edge) {
  if (!exact(web, ['target', 'privateCustomer', 'privateCart', 'publicCustomer', 'publicCart'])
    || web.target !== STAGING_SURFACE_TARGET || !exact(edge, ['target', 'functionName', 'enabled'])
    || edge.target !== STAGING_SURFACE_TARGET || edge.functionName !== 'customer-subject-broker'
    || edge.enabled !== HELD_SURFACE_FLAGS.edge
    || web.privateCustomer !== HELD_SURFACE_FLAGS.privateCustomer || web.privateCart !== HELD_SURFACE_FLAGS.privateCart
    || web.publicCustomer !== HELD_SURFACE_FLAGS.publicCustomer || web.publicCart !== HELD_SURFACE_FLAGS.publicCart) unavailable()
}

/**
 * Return a one-use producer. The source reader is intentionally injected: its
 * fixed Git policy belongs to the existing source-proof module and this
 * producer only accepts its tiny public receipt.
 */
export function createStagingGeneration23FixedPreflight ({ fetch: fetcher, vercelToken, previewBypass,
  readSourceProof, now = Date.now, factories = {} } = {}) {
  if (!STAGING_GENERATION_23_FIXED_PREFLIGHT_ENABLED || typeof fetcher !== 'function'
    || !token(vercelToken) || !token(previewBypass) || typeof readSourceProof !== 'function'
    || typeof now !== 'function' || !factories || typeof factories !== 'object' || Array.isArray(factories)) unavailable()
  const makeNative = factories.createNativeBinding ?? createStagingSurfaceNativeBinding
  const makeProtected = factories.createProtectedFetch ?? createStagingGeneration23ProtectedFetch
  if (typeof makeNative !== 'function' || typeof makeProtected !== 'function') unavailable()
  const ownedVercel = Buffer.from(vercelToken), ownedBypass = Buffer.from(previewBypass)
  let used = false, disposed = false
  const dispose = () => { if (!disposed) { disposed = true; ownedVercel.fill(0); ownedBypass.fill(0) } }

  return Object.freeze({
    async read ({ signal } = {}) {
      if (used || disposed || !signalOk(signal)) unavailable()
      used = true
      const started = now()
      if (!Number.isFinite(started)) { dispose(); unavailable() }
      let initial, protectedReader, checked
      try {
        initial = makeNative({ vercelToken: Buffer.from(ownedVercel), fetch: fetcher,
          runCli: async () => { unavailable() } })
        if (!initial || ['readPinnedRepository', 'resolveAlias', 'readPublishedGitDeployment'].some(name => typeof initial[name] !== 'function')) unavailable()
        const [repository, sourceProof] = await Promise.all([
          initial.readPinnedRepository(signal), readSourceProof({ signal }),
        ])
        if (!exact(repository, ['repoId', 'org', 'repo']) || repository.repoId !== 1264363509
          || repository.org !== 'tntipper' || repository.repo !== 'the-lifting-lab' || !validSourceProof(sourceProof)) unavailable()
        const alias = await initial.resolveAlias(STAGING_SURFACE_TARGET,
          Object.freeze({ project: 'the-lifting-lab', scope: 'my-lifting-lab-s-projects', alias: STAGING_ALIAS, branch: STAGING_BRANCH }), { signal })
        const deployment = await initial.readPublishedGitDeployment(STAGING_SURFACE_TARGET, alias.deploymentId, { signal })
        const heldEvidence = heldDeployment(alias, deployment, sourceProof, now())
        protectedReader = makeProtected({ fetch: fetcher, bypass: Buffer.from(ownedBypass),
          immutableUrl: heldEvidence.immutableUrl, maxReads: 1 })
        if (!protectedReader || typeof protectedReader.fetch !== 'function' || typeof protectedReader.dispose !== 'function') unavailable()
        checked = makeNative({ vercelToken: Buffer.from(ownedVercel), fetch: fetcher,
          protectedFetch: protectedReader.fetch, runCli: async () => { unavailable() } })
        if (!checked || ['readVercelFlags', 'readEdgeFlag'].some(name => typeof checked[name] !== 'function')) unavailable()
        const [web, edge] = await Promise.all([
          checked.readVercelFlags(STAGING_SURFACE_TARGET, Object.freeze({ privateCustomer: 'TLL_STAGING_CUSTOMER_ENABLED',
            privateCart: 'TLL_STAGING_CART_ENABLED', publicCustomer: 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER',
            publicCart: 'NEXT_PUBLIC_TLL_STAGING_CART' }), { signal }),
          checked.readEdgeFlag(STAGING_SURFACE_TARGET, 'customer-subject-broker', { signal }),
        ])
        heldRuntime(web, edge)
        const response = await fetcher(ENVIRONMENT_URL, Object.freeze({ method: 'GET', redirect: 'error',
          headers: Object.freeze({ authorization: `Bearer ${ownedVercel.toString('utf8')}`,
            accept: 'application/json', 'accept-encoding': 'identity' }), signal }))
        const checkoutTarget = checkoutTargetFromInventory(await parseBoundedJson(response, ENVIRONMENT_URL, signal))
        const observedAt = new Date(now()).toISOString()
        if (!iso(observedAt) || Date.parse(observedAt) < started || Date.parse(observedAt) - started > MAX_FRESH_PREREQUISITE_MS) unavailable()
        return Object.freeze({ preflight: Object.freeze({ heldEvidence,
          requirements: Object.freeze({ sourceCommit: heldEvidence.sourceCommit, manifestSha256: heldEvidence.manifestSha256, observedAt }) }), checkoutTarget })
      } catch { unavailable() } finally {
        try { initial?.dispose?.() } catch {}
        try { checked?.dispose?.() } catch {}
        try { protectedReader?.dispose?.() } catch {}
        dispose()
      }
    },
    dispose,
  })
}
