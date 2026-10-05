/** Deterministic HTTP wire fixture. SQL replies come only from the owned real PostgreSQL. */
import assert from 'node:assert/strict'
import https from 'node:https'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'node:fs'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { syncBuiltinESMExports, registerHooks } from 'node:module'
import { pathToFileURL } from 'node:url'
import { STAGING_BROKER_PROVIDER, BROKER_SECRET_NAME } from '../../scripts/staging-provider-broker-rotation.mjs'

const root = resolve(import.meta.dirname, '../..')
// Read wire-window metadata without preloading the old registration graph before transport hooks.
const contextSource = readFileSync(join(root, 'scripts/staging-owner-successor-sql-context.mjs'), 'utf8')
const ACTIVE_WINDOW_STARTED_AT = /export const ACTIVE_WINDOW_STARTED_AT = '([^']+)'/.exec(contextSource)[1]
const ACTIVE_WINDOW_EXPIRES_AT = /export const ACTIVE_WINDOW_EXPIRES_AT = '([^']+)'/.exec(contextSource)[1]
const WINDOW_ID = 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d'
const OWNER_SUCCESSOR_EDGE_REVISION = 'tll-owner-successor-20261005-1'
export const config = JSON.parse(readFileSync(join(root, 'qualification-config.json'), 'utf8'))
// A virtual elapsed clock avoids a 39-minute wall wait. Actual journal writes and
// component decisions are unchanged; only the external clock moves after the
// surface-enable receipt has been durably verified, before the owner phase.
const realNow = Date.now
let elapsedMs = 0
Date.now = () => realNow() + elapsedMs
const actualWrite = fs.writeSync
fs.writeSync = (...args) => {
  const written = actualWrite(...args)
  if (config.mode === 'owner-budget' && elapsedMs === 0 && Buffer.isBuffer(args[1])) {
    try {
      const record = JSON.parse(args[1].toString())
      if (record.schema === 'tll-owner-successor-whole-route/v1'
        && record.phases?.at(-1)?.phase === 'surfaceEnable' && record.phases.at(-1).state === 'VERIFIED') elapsedMs = 39 * 60_000
    } catch { /* unrelated wire/journal bytes do not move the clock */ }
  }
  return written
}
const handoff = JSON.parse(readFileSync(join(root, '.agent/owner-successor', WINDOW_ID, 'source-review.json')))
export const trace = event => appendFileSync(join(root, 'qualification-transport-events.jsonl'), `${JSON.stringify({ event, pid: process.pid })}\n`)
const project = 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', team = 'team_gf7cgIkkoeMLtODFDDT5MrW4'
const envs = [], edge = new Map([[BROKER_SECRET_NAME, 'synthetic-broker-secret'], ['TLL_STAGING_BROKER_DATABASE_PASSWORD', 'prior-synthetic']])
for (const purpose of ['customer', 'cart', 'broker', 'provisional', 'bridge']) envs.push({ id: `env_${purpose}Password`, key: `TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`, value: 'old-synthetic', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'sensitive', visibility: 'secret' })
const flagIds = { TLL_STAGING_CUSTOMER_ENABLED: 'd7igdi7ZsCPX37Dc', TLL_STAGING_CART_ENABLED: '0pdakPUlRtuXn8pj', NEXT_PUBLIC_TLL_STAGING_CUSTOMER: 'FfUAQa5ND6RAnn2x', NEXT_PUBLIC_TLL_STAGING_CART: '9f9dTcJFE1wcsPcA' }
for (const key of ['TLL_STAGING_CUSTOMER_ENABLED', 'TLL_STAGING_CART_ENABLED', 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER', 'NEXT_PUBLIC_TLL_STAGING_CART', 'TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED']) envs.push({ id: flagIds[key] ?? `env_${key}`, key, value: key.startsWith('NEXT_PUBLIC_') ? 'disabled' : 'false', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'encrypted', visibility: 'config' })
envs.push({ id: 'env_brokerSecret', key: BROKER_SECRET_NAME, value: 'synthetic-broker-secret', target: ['preview'], gitBranch: 'codex/tll-integration', type: 'sensitive', visibility: 'secret' })
let edgeEnabled = false, providerEnabled = false, sequence = 0
const flag = key => envs.find(e => e.key === key)?.value === (key.startsWith('NEXT_PUBLIC_') ? 'enabled' : 'true')
const flags = () => ({ privateCustomer: flag('TLL_STAGING_CUSTOMER_ENABLED'), privateCart: flag('TLL_STAGING_CART_ENABLED'), publicCustomer: flag('NEXT_PUBLIC_TLL_STAGING_CUSTOMER'), publicCart: flag('NEXT_PUBLIC_TLL_STAGING_CART') })
let deployment = { id: 'dpl_held123', url: 'the-lifting-held-my-lifting-lab-s-projects.vercel.app', createdAt: Date.now(), flags: flags() }
// Synthetic external services retain accepted effects across worker crashes/restarts.
const statePath = join(root, 'qualification-external-state.json')
if (existsSync(statePath)) {
  const previous = JSON.parse(readFileSync(statePath, 'utf8'))
  envs.splice(0, envs.length, ...previous.envs); edge.clear(); for (const [name, value] of previous.edge) edge.set(name, value)
  edgeEnabled = previous.edgeEnabled; providerEnabled = previous.providerEnabled
  deployment = previous.deployment; sequence = previous.sequence
}
const persistExternalState = () => writeFileSync(statePath, JSON.stringify({ envs, edge: [...edge], edgeEnabled, providerEnabled, deployment, sequence }), { mode: 0o600 })
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json', ...extra } })
const provider = () => ({ id: 'custom-provider-id', provider_type: 'oauth2', identifier: 'custom:tll-staging-subject-broker-v1', name: 'TLL staging subject broker', client_id: STAGING_BROKER_PROVIDER.clientId, acceptable_client_ids: [], scopes: ['subject'], pkce_enabled: true, attribute_mapping: {}, authorization_params: {}, enabled: providerEnabled, email_optional: true, issuer: '', discovery_url: '', skip_nonce_check: false, authorization_url: STAGING_BROKER_PROVIDER.authorizationUrl, token_url: STAGING_BROKER_PROVIDER.tokenUrl, userinfo_url: STAGING_BROKER_PROVIDER.userinfoUrl, jwks_uri: STAGING_BROKER_PROVIDER.jwksUrl, discovery_document: null, created_at: ACTIVE_WINDOW_STARTED_AT, updated_at: ACTIVE_WINDOW_STARTED_AT })
export function executeSql(sql, user = 'postgres', password) {
  assert.match(config.dockerHost, /^unix:\/\//); assert.match(config.containerName, /^tll-successor-default-[a-f0-9-]+$/)
  const args = ['exec', '-i', ...(password ? ['-e', `PGPASSWORD=${password}`] : []), config.containerName, 'psql', '-XqAt', '-U', user, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', ...(password ? ['-h', '127.0.0.1'] : [])]
  try { return execFileSync(config.dockerExecutable, args, { input: sql, env: { PATH: '/usr/local/bin:/usr/bin:/bin', DOCKER_HOST: config.dockerHost }, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1024 * 1024 }).trim() }
  catch (raw) { const guard = /(?:Generation 23 predecessor check|Control activation|Customer repository operator|Broker repository operator|Provisional repository operator|Bridge repository operator) [a-z ]+/.exec(String(raw.stderr ?? ''))?.[0]; if (guard) trace(`sql_guard:${guard}`); trace(`sql_transport_error:${raw.status ?? 'none'}:${/(?:ERROR|FATAL):\s+([0-9A-Z]{5}):/.exec(String(raw.stderr))?.[1] ?? 'unknown'}`); const error = Error('Owned fixture SQL denied'); error.code = /ERROR:\s+([0-9A-Z]{5}):/.exec(raw.stderr ?? '')?.[1] ?? (/password authentication failed/.test(raw.stderr ?? '') ? '28P01' : null); throw error }
}
function management(query) {
  const labels = [...query.matchAll(/\bAS\s+(tll_[a-z0-9_]+)\s*;/gi)]
  assert.ok(labels.length, 'actual SQL receipt column required')
  const alias = labels.at(-1)[1]; trace(`actual_sql:${alias}`)
  const rows = [{ [alias]: JSON.parse(executeSql(query)) }]
  trace(`sql_effect_or_readback:${alias}`)
  if (alias === 'tll_owner_successor_final_check') trace(`final_receipt:${JSON.stringify(rows[0][alias])}`)
  if (alias === 'tll_owner_successor_credential_receipt') {
    if (config.mode === 'crash-setup') process.exit(97)
    if (config.mode === 'lost-parent') { process.kill(process.ppid, 'SIGKILL'); return rows }
  }
  return rows
}
function awaitLateReply(response, callback, result) {
  setTimeout(() => { trace('late_setup_reply'); response.statusCode = 201; response.headers = { 'content-type': 'application/json', 'content-encoding': 'identity' }; callback(response); response.end(Buffer.from(JSON.stringify(result))) }, 100)
}
https.request = (options, callback) => {
  assert.equal(options.hostname, 'api.supabase.com'); assert.equal(options.path, '/v1/projects/qdmvngjwkcsilzmqksme/database/query'); assert.equal(options.method, 'POST')
  assert.equal(options.rejectUnauthorized, true); assert.equal(options.minVersion, 'TLSv1.2')
  const request = new EventEmitter(); request.destroy = () => { request.destroyed = true }
  request.end = bytes => {
    const input = JSON.parse(bytes.toString()); const response = new PassThrough()
    queueMicrotask(() => { try {
      const result = management(input.query)
      if (config.mode === 'cancel-setup' && /AS tll_owner_successor_credential_receipt;/.test(input.query)) {
        trace('cancel_parent_before_late_setup_reply'); process.kill(process.ppid, 'SIGTERM')
        awaitLateReply(response, callback, result); return
      }
      response.statusCode = 201; response.headers = { 'content-type': 'application/json', 'content-encoding': 'identity' }
      callback(response); response.end(Buffer.from(JSON.stringify(result)))
    } catch { request.emit('error', Error('Synthetic SQL response unavailable')) } })
  }
  return request
}
const fixtureFetch = async (url, options = {}) => {
  const parsed = new URL(url), path = parsed.pathname, method = options.method ?? 'GET'
  assert.equal(options.signal?.aborted, false); trace(`http:${method}:${path}`)
  if (parsed.hostname === 'api.vercel.com') {
    if (method === 'GET' && /^\/v9\/projects\/[^/]+$/.test(path)) return json({ id: project, name: 'the-lifting-lab', accountId: team, link: { type: 'github', repoId: 1264363509, repoOwnerId: 12345, org: 'tntipper', repo: 'the-lifting-lab', productionBranch: 'main', sourceless: false } })
    if (path.includes('/env')) {
      const body = options.body && JSON.parse(options.body)
      if (method === 'GET' && !path.includes('/env/')) return json({ envs: envs.map(e => ({ ...e })), pagination: { next: null } })
      if (method === 'POST') { const item = { ...body, id: `env_replaced${++sequence}` }; envs.push(item); return json({ failed: [], created: item }, 201) }
      const item = envs.find(e => e.id === path.split('/').at(-1)); assert.ok(item, 'fixed environment ID')
      if (method === 'PATCH') { Object.assign(item, body); if (config.mode === 'lost-setting-reply' && item.key === 'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD') { trace('accepted_setting_reply_lost'); throw Error('Synthetic accepted setting response lost') }; return json(item) }
      if (method === 'DELETE') { envs.splice(envs.indexOf(item), 1); return json({}) }
      return json({ ...item, decrypted: true })
    }
    if (method === 'POST' && path === '/v13/deployments') {
      const body = JSON.parse(options.body); assert.equal(body.gitSource.sha, handoff.reviewedBaseSha)
      deployment = { id: `dpl_fixture${++sequence}`, url: `the-lifting-fixture${sequence}-my-lifting-lab-s-projects.vercel.app`, createdAt: Date.now(), flags: flags() }
      return json({ id: deployment.id, readyState: 'READY', target: null })
    }
    if (path.startsWith('/v13/deployments/')) return json({ id: deployment.id, readyState: 'READY', target: null, projectId: project, ownerId: team, url: deployment.url, createdAt: deployment.createdAt, gitSource: { type: 'github', repoId: 1264363509, ref: 'codex/tll-integration', sha: handoff.reviewedBaseSha }, meta: { githubCommitRef: 'codex/tll-integration', githubCommitSha: handoff.reviewedBaseSha, tllManifestSha256: handoff.manifestSha256 } })
    if (path.startsWith('/v4/aliases/')) return json({ alias: parsed.pathname.split('/').at(-1), projectId: project, deploymentId: deployment.id, deployment: { id: deployment.id, url: deployment.url } })
  }
  if (parsed.hostname === 'api.supabase.com') {
    if (path.endsWith('/api-keys')) return json([{ name: 'service_role', type: 'legacy', api_key: 's'.repeat(64) }, { name: 'default', type: 'secret', api_key: `sb_secret_${'d'.repeat(32)}` }])
    if (path.endsWith('/secrets')) {
      if (method === 'POST') { for (const item of JSON.parse(options.body)) edge.set(item.name, item.value); return json({}, 201) }
      if (method === 'DELETE') { for (const name of JSON.parse(options.body)) edge.delete(name); return json({}) }
      return json([...edge.keys()].map(name => ({ name })))
    }
    if (path.endsWith('/database/query')) return json(management(JSON.parse(options.body).query), 201)
  }
  if (path.includes('/auth/v1/admin/custom-providers/')) {
    if (method === 'PUT' || method === 'PATCH') providerEnabled = JSON.parse(options.body).enabled
    return json(provider())
  }
  if (path.endsWith('/tll-broker-token')) return json({ error: edgeEnabled ? 'invalid_client' : 'temporarily_unavailable' }, edgeEnabled ? 401 : 503, edgeEnabled ? {} : { 'x-tll-staging-edge-control': 'disabled' })
  if (path.endsWith('/tll-broker-readiness-owner-successor')) {
    const revision = { 'x-tll-broker-revision': OWNER_SUCCESSOR_EDGE_REVISION }
    if (!edge.has('TLL_STAGING_BROKER_READINESS_WINDOW')) return json({ status: 'held' }, 404, revision)
    if (options.headers?.['x-tll-broker-guard-audit']) return json({ status: 'GUARDS', projectUrlMatches: true, brokerFlagOff: !edgeEnabled, window: 'active' }, 200, revision)
    return json({ status: 'PASS', windowId: WINDOW_ID, expiresAt: ACTIVE_WINDOW_EXPIRES_AT }, 200, revision)
  }
  if (path === '/api/staging/readiness') {
    if (options.redirect === 'manual') return json({ error: { message: 'Protected deployment', code: '401' }, protection: { vercel_auth_callback: `https://vercel.com/sso-api?url=${encodeURIComponent(url)}&nonce=offline` } }, 401, { server: 'Vercel' })
    return json({ deploymentId: deployment.id, immutableUrl: `https://${deployment.url}`, projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration', ...deployment.flags })
  }
  if (path === '/api/staging/consumer-readiness') return json({ status: 'PASS', deploymentId: deployment.id, checks: { customer: 'PASS', cart: 'PASS', provisional: 'PASS', bridge: 'PASS' } })
  if (path === '/api/staging/checkout-readiness') return json({ deploymentId: deployment.id, immutableUrl: `https://${deployment.url}`, projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration', checkoutHandoffEnabled: flag('TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED') })
  if (path === '/api/staging/variant-readiness') return json({ status: 'SHOPIFY_STAGING_VARIANT_PRICE_VERIFIED', deploymentId: new Headers(options.headers).get('x-tll-deployment-id'), immutableUrl: parsed.origin, variantId: 'gid://shopify/ProductVariant/57160491139412', pricePence: 2500, observedAt: new Date().toISOString() })
  if (method === 'HEAD' && parsed.hostname.endsWith('.vercel.app')) return new Response(null, { status: 200 })
  throw Error(`Unrecognised qualification HTTP boundary: ${method}:${path}`)
}
globalThis.fetch = async (...args) => { try { return await fixtureFetch(...args) } finally { persistExternalState() } }
registerHooks({ resolve(specifier, context, next) {
  if (specifier === 'pg' || specifier === 'playwright') return { url: pathToFileURL(join(root, `tests/fixtures/owner-successor-default-${specifier}.mjs`)).href, shortCircuit: true }
  const result = next(specifier, context)
  if (result.url.startsWith(pathToFileURL(join(root, 'scripts/')).href)) trace(`used_module:${result.url.split('/').at(-1)}`)
  return result
} })
syncBuiltinESMExports()
export function setEdge(value) { edgeEnabled = value; persistExternalState() }
