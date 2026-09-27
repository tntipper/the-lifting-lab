// @ts-expect-error Deno Edge requires explicit source extensions; Next resolves them.
import { createStagingPostgresRuntime } from '../server/staging-postgres.ts'
import { timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'

type Environment = Readonly<Record<string, string | undefined>>
type RuntimeFactory = typeof createStagingPostgresRuntime
export const STAGING_BROKER_READINESS_ENABLED = false
const PROJECT_URL = 'https://qdmvngjwkcsilzmqksme.supabase.co'
const WINDOW_ID = 'b7bf72d4-18c1-4b85-8e7c-23a95dd845fe'
const WINDOW_NAME = 'TLL_STAGING_BROKER_READINESS_WINDOW'
function activeWindow(env: Environment, now: number) {
  const parts = env[WINDOW_NAME]?.split('|')
  if (!parts || parts.length !== 3 || parts[0] !== WINDOW_ID
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(parts[1])
    || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(parts[2])) return null
  const start = Date.parse(parts[1]), end = Date.parse(parts[2])
  if (!Number.isFinite(now) || !Number.isFinite(start) || !Number.isFinite(end)
    || start > now || now >= end || end - start > 3_600_000 || end <= start) return null
  return Object.freeze({ windowId: WINDOW_ID, expiresAt: parts[2] })
}
const response = (status: number, value: string) => new Response(JSON.stringify({ status: value }), {
  status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' },
})
const equal = (left: string | null, right: string): boolean => {
  if (!left || Buffer.byteLength(left) !== Buffer.byteLength(right)) return false
  return timingSafeEqual(Buffer.from(left), Buffer.from(right))
}

/** Dedicated staging function. Authenticates before any connection or secret read. */
export function createStagingBrokerReadinessHandler(env: Environment,
  runtimeFactory: RuntimeFactory = createStagingPostgresRuntime, now = Date.now) {
  return async (request: Request): Promise<Response> => {
    const window = activeWindow(env, now())
    if ((!STAGING_BROKER_READINESS_ENABLED && !window) || request.method !== 'GET' || env.SUPABASE_URL !== PROJECT_URL
      || env.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED !== 'false') return response(404, 'held')
    const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey || serviceKey.length < 32
      || !equal(request.headers.get('authorization'), `Bearer ${serviceKey}`)
      || !equal(request.headers.get('apikey'), serviceKey)) return response(404, 'held')
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
        'x-robots-tag': 'noindex, nofollow', 'referrer-policy': 'no-referrer' } })
  }
}

export function brokerReadinessEnvironment(): Environment {
  const deno = (globalThis as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno
  const get = (name: string) => deno?.env?.get(name)
  return Object.freeze({ SUPABASE_URL: get('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: get('SUPABASE_SERVICE_ROLE_KEY'),
    TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: get('TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'),
    TLL_STAGING_BROKER_DATABASE_PASSWORD: get('TLL_STAGING_BROKER_DATABASE_PASSWORD'),
    TLL_STAGING_BROKER_READINESS_WINDOW: get(WINDOW_NAME),
    TLL_STAGING_POSTGRES_CA_PEM: get('TLL_STAGING_POSTGRES_CA_PEM'),
    TLL_STAGING_POSTGRES_CA_SHA256: get('TLL_STAGING_POSTGRES_CA_SHA256') })
}
