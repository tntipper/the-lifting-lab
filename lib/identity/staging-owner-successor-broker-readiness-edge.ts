// @ts-expect-error Deno Edge requires explicit source extensions; Next resolves them.
import { createStagingPostgresRuntime } from '../server/staging-postgres.ts'
import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

type Environment = Readonly<Record<string, string | undefined>>
type RuntimeFactory = typeof createStagingPostgresRuntime
export const OWNER_SUCCESSOR_BROKER_READINESS_ENABLED = false
const PROJECT_URL = 'https://qdmvngjwkcsilzmqksme.supabase.co'
const WINDOW_ID = 'cd4130c8-a8b8-462b-bdbe-5c3e6250a02d'
export const STAGING_BROKER_READINESS_REVISION = 'tll-owner-successor-20261005-1'
const WINDOW_NAME = 'TLL_STAGING_BROKER_READINESS_WINDOW'
const GUARD_AUDIT_HEADER = 'tll-gen23-guard-audit/v1'
const TRACE_ID = 'b120e4c4-0673-40ca-a3f0-523db406243d'
const TRACE_END = Date.parse('2026-09-28T10:00:00.000Z')
function activeWindow(env: Environment, now: number) {
  const parts = env[WINDOW_NAME]?.split('|')
  if (!parts || parts.length !== 3 || parts[0] !== WINDOW_ID
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(parts[1])
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(parts[2])) return null
  const start = Date.parse(parts[1]), end = Date.parse(parts[2])
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end)
    || start > now || now >= end || end - start > 3_600_000 || end - start < 2_700_000
    || new Date(start).toISOString() !== parts[1] || new Date(end).toISOString() !== parts[2]) return null
  return Object.freeze({ windowId: WINDOW_ID, expiresAt: parts[2] })
}
const response = (status: number, value: string) => new Response(JSON.stringify({ status: value }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
    'x-tll-broker-revision': STAGING_BROKER_READINESS_REVISION },
})
const equal = (left: string | null, right: string): boolean => {
  if (!left || Buffer.byteLength(left) !== Buffer.byteLength(right)) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}
function defaultSecretKey(env: Environment): string | undefined {
  const raw = env.SUPABASE_SECRET_KEYS
  if (!raw || raw.length > 8192) return undefined
  try {
    const values = JSON.parse(raw)
    const key = values && typeof values === 'object' && !Array.isArray(values) ? values.default : undefined
    return typeof key === 'string' && /^sb_secret_[A-Za-z0-9_-]{24,256}$/.test(key) ? key : undefined
  } catch { return undefined }
}

/** Dedicated staging function. Authenticates before any connection or secret read. */
export function createStagingBrokerReadinessHandler(env: Environment,
  runtimeFactory: RuntimeFactory = createStagingPostgresRuntime, now = Date.now,
  log: (message: string) => void = console.info) {
  return async (request: Request): Promise<Response> => {
    const observedAt = now()
    const window = activeWindow(env, observedAt)
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    const serviceKeyUsable = !!serviceKey && serviceKey.length >= 32
    const authorizationMatches = serviceKeyUsable
      && equal(request.headers.get('authorization'), `Bearer ${serviceKey}`)
    const apikeyMatches = serviceKeyUsable
      && equal(request.headers.get('apikey'), serviceKey)
    const secretKey = defaultSecretKey(env)
    const secretApikeyMatches = !!secretKey && equal(request.headers.get('apikey'), secretKey)
    const authenticated = secretApikeyMatches
    // One bounded staging trace records only fixed booleans privately. The
    // public response remains the same held response for a wrong credential.
    if (observedAt < TRACE_END && new URL(request.url).searchParams.get('tll_guard_trace') === TRACE_ID) {
      log(JSON.stringify({ event: 'TLL_BROKER_GUARD_TRACE', correlationId: TRACE_ID,
        revision: STAGING_BROKER_READINESS_REVISION,
        auditHeaderMatches: request.headers.get('x-tll-broker-guard-audit') === GUARD_AUDIT_HEADER,
        methodIsGet: request.method === 'GET', serviceKeyUsable,
        authorizationPresent: request.headers.has('authorization'), authorizationMatches,
        apikeyPresent: request.headers.has('apikey'), apikeyMatches,
        defaultSecretKeyUsable: !!secretKey, secretApikeyMatches,
        projectUrlMatches: env.SUPABASE_URL === PROJECT_URL,
        brokerFlagOff: env.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED === 'false',
        window: window ? 'active' : env[WINDOW_NAME] ? 'invalid' : 'absent' }))
    }
    if (request.headers.get('x-tll-broker-guard-audit') === GUARD_AUDIT_HEADER) {
      if (!authenticated || request.method !== 'GET') return response(404, 'held')
      return new Response(JSON.stringify({ status: 'GUARDS',
        projectUrlMatches: env.SUPABASE_URL === PROJECT_URL,
        brokerFlagOff: env.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED === 'false',
        window: window ? 'active' : env[WINDOW_NAME] ? 'invalid' : 'absent' }), {
        status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store',
          'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
          'x-tll-broker-revision': STAGING_BROKER_READINESS_REVISION },
      })
    }
    if ((!OWNER_SUCCESSOR_BROKER_READINESS_ENABLED || !window) || request.method !== 'GET' || env.SUPABASE_URL !== PROJECT_URL
      || env.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED !== 'false') return response(404, 'held')
    if (!authenticated) return response(404, 'held')
    const password = env.TLL_STAGING_BROKER_DATABASE_PASSWORD
    const pem = env.TLL_STAGING_POSTGRES_CA_PEM, sha256 = env.TLL_STAGING_POSTGRES_CA_SHA256
    if (!password || password.length < 32 || !pem || !sha256 || !/^[a-f0-9]{64}$/.test(sha256))
      return response(503, 'FAIL')
    let runtime: ReturnType<RuntimeFactory> | undefined
    let client: Awaited<ReturnType<ReturnType<RuntimeFactory>['pool']['connect']>> | undefined
    let passed = false
    try {
      runtime = runtimeFactory({ purpose: 'broker', enabled: true, password, tlsCa: { pem, sha256 } })
      client = await runtime.pool.connect()
      const result = await client.query('SELECT current_user::text AS role')
      passed = result.rows.length === 1 && result.rows[0]?.role === 'tll_broker_runtime'
    } catch { passed = false }
    finally {
      try { client?.release(true) } catch { passed = false }
      try { await runtime?.close() } catch { passed = false }
    }
    if (!passed) return response(503, 'FAIL')
    const stillActive = activeWindow(env, now())
    if (!stillActive || stillActive.windowId !== window?.windowId || stillActive.expiresAt !== window?.expiresAt)
      return response(404, 'held')
    return new Response(JSON.stringify({ status: 'PASS', ...stillActive }), { status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store',
        'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer',
        'x-tll-broker-revision': STAGING_BROKER_READINESS_REVISION } })
  }
}

export function brokerReadinessEnvironment(): Environment {
  const deno = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno
  const get = (name: string) => deno?.env?.get(name)
  return Object.freeze({ SUPABASE_URL: get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: get('SUPABASE_SERVICE_ROLE_KEY'),
    SUPABASE_SECRET_KEYS: get('SUPABASE_SECRET_KEYS'),
    TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: get('TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'),
    TLL_STAGING_BROKER_DATABASE_PASSWORD: get('TLL_STAGING_BROKER_DATABASE_PASSWORD'),
    TLL_STAGING_BROKER_READINESS_WINDOW: get(WINDOW_NAME),
    TLL_STAGING_POSTGRES_CA_PEM: get('TLL_STAGING_POSTGRES_CA_PEM'),
    TLL_STAGING_POSTGRES_CA_SHA256: get('TLL_STAGING_POSTGRES_CA_SHA256') })
}
