/** Runs only against an isolated, locally armed source copy with synthetic I/O. */
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'

const directory = process.argv[2]
const mode = process.argv[3] ?? 'success'
if (!directory) throw Error('isolated fixture directory required')
if (!['success', 'lost-middle', 'lost-retirement', 'entry-success',
  'entry-lost-middle'].includes(mode)) throw Error('unknown fixture mode')
const load = async name => import(pathToFileURL(join(directory, 'scripts', name)).href)
const [{ createStagingGeneration22WorkerAssembly: assemble, FIXED_GENERATION_22_PARTS: fixed },
  credential, recovery, active, retired, material, baseline, verifier, identities] = await Promise.all([
  load('staging-generation-22-worker-assembly.mjs'),
  load('staging-generation-22-credentials.mjs'),
  load('staging-generation-22-recovery.mjs'),
  load('staging-generation-22-active-check.mjs'),
  load('staging-generation-22-retired-check.mjs'),
  load('staging-generation-22-material.mjs'),
  load('staging-account-hosted-baseline-vercel.mjs'),
  load('staging-generation-6-connection-verifier.mjs'),
  load('staging-generation-6-credentials.mjs'),
])

const managementToken = Buffer.from(`sbp_${'a'.repeat(40)}`)
const vercelToken = Buffer.from('fixture-vercel-token')
const events = [], environment = [], byId = new Map()
const response = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
})
const target = baseline.HOSTED_BASELINE_VERCEL_TARGET
const fetcher = async (url, options) => {
  const method = options.method
  const parsed = new URL(url)
  if (parsed.hostname === 'api.vercel.com'
    && parsed.pathname === `/v10/projects/${target.projectId}/env` && method === 'POST') {
    const body = JSON.parse(options.body)
    assert.equal(body.gitBranch, target.branch)
    assert.deepEqual(body.target, ['preview'])
    const id = `env_gen22_${String(environment.length + 1).padStart(4, '0')}`
    const item = { id, key: body.key, value: body.value, gitBranch: target.branch,
      target: ['preview'], type: body.type, visibility: body.visibility }
    environment.push(item); byId.set(id, item)
    events.push(body.type === 'sensitive' ? 'vercel-secret' : 'vercel-disabled')
    if (['lost-middle', 'entry-lost-middle'].includes(mode)
      && body.type === 'sensitive' && environment.length === 3) {
      throw Error('synthetic accepted write lost its reply')
    }
    return response({ failed: [], created: item }, 201)
  }
  if (parsed.hostname === 'api.supabase.com'
    && parsed.pathname === '/v1/projects/qdmvngjwkcsilzmqksme/secrets' && method === 'POST') {
    assert.equal(JSON.parse(options.body)[0].name, 'TLL_STAGING_BROKER_DATABASE_PASSWORD')
    events.push('edge-secret')
    return response({}, 201)
  }
  if (parsed.hostname === 'api.vercel.com'
    && parsed.pathname === `/v9/projects/${target.projectId}` && method === 'GET') {
    events.push('project-read')
    return response({ id: target.projectId, name: target.project, accountId: target.teamId,
      link: { type: 'github', repoId: 1264363509, repoOwnerId: 776655,
        org: target.githubOrg, repo: target.githubRepository,
        productionBranch: target.githubProductionBranch, sourceless: false } })
  }
  if (parsed.hostname === 'api.vercel.com'
    && parsed.pathname === `/v10/projects/${target.projectId}/env` && method === 'GET') {
    events.push('inventory-read')
    return response({ envs: environment, pagination: { next: null } })
  }
  if (parsed.hostname === 'api.supabase.com'
    && parsed.pathname === '/v1/projects/qdmvngjwkcsilzmqksme/secrets' && method === 'GET') {
    events.push('edge-names-read')
    return response([{ name: 'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET' },
      { name: 'TLL_STAGING_BROKER_DATABASE_PASSWORD' }])
  }
  if (parsed.hostname === 'api.vercel.com'
    && parsed.pathname.startsWith(`/v1/projects/${target.projectId}/env/`) && method === 'GET') {
    const item = byId.get(parsed.pathname.split('/').at(-1))
    assert.ok(item)
    events.push('disabled-value-read')
    return response({ ...item, decrypted: true })
  }
  throw Error('unrecognized fixture endpoint')
}

const createRuntime = ({ purpose, password, tlsCa }) => {
  assert.match(password, /^[A-Za-z0-9_-]{64}$/)
  assert.equal(typeof tlsCa.pem, 'string')
  let released = false
  return { pool: { async connect() {
    events.push(`login:${purpose}`)
    return { async query(sql) {
      if (sql === verifier.IDENTITY_QUERY) return { rows: [{ database: 'postgres',
        current_role: identities.IDENTITIES[purpose].login,
        session_role: identities.IDENTITIES[purpose].login,
        application_name: 'Supavisor', can_login: true, inherits: false,
        superuser: false, bypass_rls: false, create_role: false, create_database: false,
        replication: false, valid_until: credential.ACTIVE_WINDOW_EXPIRES_AT }] }
      if (sql === verifier.MEMBERSHIP_QUERY) return { rows: [{
        granted: identities.IDENTITIES[purpose].membership,
        member: identities.IDENTITIES[purpose].login, grantor: 'postgres',
        admin_option: false, inherit_option: true, set_option: false,
      }] }
      if (sql === verifier.FUNCTION_MATRIX_QUERY) return { rows: Object.entries(verifier.ENTRYPOINTS)
        .flatMap(([owner, signatures]) => signatures.map(signature => ({
          purpose: owner, signature, present: true, allowed: owner === purpose,
        }))) }
      if (sql === verifier.PRIVATE_TABLE_DENIAL_QUERY || ['cart', 'bridge'].includes(purpose)) {
        released = true; throw Error('expected synthetic denial')
      }
      return { rows: [{ result: { status: 'rejected' } }] }
    }, release(force) { released ||= force === true } }
  } }, async close() { assert.equal(released, true); events.push(`close:${purpose}`) } }
}

const receipt = (status, id, expiresAt) => ({ status, [id.kind]: id.value,
  projectRef: material.PROJECT_REF, generation: 22, windowId: credential.WINDOW_ID,
  expiresAt, controlsEnabled: false, runtimeCount: 5 })
const parts = { ...fixed, createRuntime,
  async postCredential(packet, { token }) {
    assert.equal(token, managementToken)
    assert.match(credential.consumeStagingGeneration22PreparedSql(packet), /BEGIN;/)
    events.push('database-install')
    return [{ tll_generation_22_credential_receipt: receipt('PASS',
      { kind: 'packageId', value: credential.PACKAGE_ID }, credential.ACTIVE_WINDOW_EXPIRES_AT) }]
  },
  async postActive(expiresAt, { token }) {
    assert.equal(token, managementToken); events.push('active-read')
    return [{ tll_generation_22_active_check: {
      ...receipt('PASS_ACTIVE', { kind: 'queryId', value: active.QUERY_ID }, expiresAt),
      runtimeSessions: 0,
    } }]
  },
  async postRecovery(packet, { token }) {
    assert.equal(token, managementToken)
    const prepared = recovery.consumeStagingGeneration22PreparedRecoverySql(packet)
    assert.match(prepared.sql, /BEGIN;/)
    events.push('retirement')
    if (mode === 'lost-retirement') throw Error('synthetic retirement reply lost')
    return [{ tll_generation_22_recovery_receipt: receipt('PASS_RETIRED',
      { kind: 'recoveryId', value: recovery.RECOVERY_ID }, prepared.expiresAt) }]
  },
  async postRetired(expiresAt, { token }) {
    assert.equal(token, managementToken); events.push('retired-read')
    return [{ tll_generation_22_retired_check: {
      ...receipt('PASS_RETIRED', { kind: 'queryId', value: retired.QUERY_ID }, expiresAt),
      runtimeSessions: 0,
    } }]
  },
}

if (mode.startsWith('entry-')) {
  const entry = await load('staging-generation-22-worker-entry.mjs')
  const passed = await entry.runStagingGeneration22Worker({
    signal: new AbortController().signal,
    readCredentials: async () => ({ managementToken, vercelToken }),
    createWorker: credentials => assemble({ ...credentials, parts, fetcher }),
    write: value => new Promise((resolveWrite, rejectWrite) => {
      process.stdout.write(value, error => error ? rejectWrite(error) : resolveWrite())
    }),
  })
  assert.equal(managementToken.every(byte => byte === 0), true)
  assert.equal(vercelToken.every(byte => byte === 0), true)
  process.exitCode = passed ? 0 : 1
} else {
  let assembly, result
  try {
    assembly = assemble({ managementToken, vercelToken, parts, fetcher })
    result = await assembly.core.run({ signal: new AbortController().signal })
  } finally {
    assembly?.dispose()
    managementToken.fill(0); vercelToken.fill(0)
  }
  process.stdout.write(JSON.stringify({ status: result.status,
  writes: events.filter(event => ['database-install', 'vercel-secret', 'edge-secret', 'vercel-disabled']
    .includes(event)).length,
  logins: events.filter(event => event.startsWith('login:')).length,
  closes: events.filter(event => event.startsWith('close:')).length,
  activeBeforeRetirement: events.indexOf('active-read') < events.indexOf('retirement'),
  retirementBeforeFinalRead: events.indexOf('retirement') < events.indexOf('retired-read'),
  readbackBeforeLogin: events.indexOf('disabled-value-read') < events.indexOf('login:customer'),
  readbackCompleted: events.includes('disabled-value-read'),
  activeReadCompleted: events.includes('active-read'),
  finalReadCompleted: events.includes('retired-read'),
  }))
}
