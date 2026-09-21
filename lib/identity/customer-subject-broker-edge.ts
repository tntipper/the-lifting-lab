// Source-only Supabase Edge machine boundary for the subject broker. The public
// OAuth endpoints authenticate with Confidential Basic / one-use Bearer. They
// never receive browser cookies, Shopify credentials, proof vault keys or users.
// @ts-expect-error Deno Edge requires explicit source extensions; the Next/esbuild bundle resolves them.
import { createCustomerSubjectBroker, type BrokerProtocolResponse } from './customer-subject-broker.ts'
import { Buffer } from 'node:buffer'
// @ts-expect-error Deno Edge requires explicit source extensions; the Next/esbuild bundle resolves them.
import { createCustomerSubjectBrokerRepository } from './customer-subject-broker-repository.ts'
// @ts-expect-error Deno Edge requires explicit source extensions; the Next/esbuild bundle resolves them.
import { createStagingPostgresRuntime } from '../server/staging-postgres.ts'

const PROJECT_URL = 'https://qdmvngjwkcsilzmqksme.supabase.co'
const MAX_BODY = 4096, MAX_HEADERS = 8192
type Surface = 'token' | 'userinfo'
type RuntimeFactory = typeof createStagingPostgresRuntime
type CoreFactory = typeof createCustomerSubjectBroker
type RepositoryFactory = typeof createCustomerSubjectBrokerRepository
type Environment = Readonly<Record<string, string | undefined>>
type Dependencies = Readonly<{ runtimeFactory?: RuntimeFactory; coreFactory?: CoreFactory; repositoryFactory?: RepositoryFactory }>

const secret = (value: unknown): value is string => typeof value === 'string' && Buffer.byteLength(value) >= 32
  && Buffer.byteLength(value) <= 512 && !/[\x00-\x1f\x7f]/.test(value)
const fixed = () => new Response(JSON.stringify({ error: 'temporarily_unavailable' }), { status: 503, headers: {
  'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache',
  'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff',
} })

async function boundedBody(request: Request): Promise<string> {
  if (request.headers.has('content-encoding')) throw new Error('held')
  const length = request.headers.get('content-length')
  if (length !== null && (!/^(0|[1-9][0-9]{0,3})$/.test(length) || Number(length) > MAX_BODY)) throw new Error('held')
  const reader = request.body?.getReader()
  if (!reader) return ''
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > MAX_BODY) throw new Error('held')
      chunks.push(part.value)
    }
    if (length !== null && size !== Number(length)) throw new Error('held')
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))
  } finally { void reader.cancel().catch(() => {}) }
}
function headers(request: Request): readonly (readonly [string, string])[] {
  const result: [string, string][] = []; let size = 0
  for (const [name, value] of request.headers) {
    size += name.length + value.length
    if (size > MAX_HEADERS || /[\x00\r\n]/.test(name + value)) throw new Error('held')
    result.push([name, value])
  }
  return result
}
function response(value: BrokerProtocolResponse): Response {
  const h = new Headers(value.headers)
  h.set('referrer-policy', 'no-referrer'); h.set('x-content-type-options', 'nosniff')
  return new Response(JSON.stringify(value.body), { status: value.status, headers: h })
}

/** Request-scoped Edge handler. No pool or secret is retained across requests.
 * The restricted runtime role can execute only tll_broker_private.repository. */
export function createCustomerSubjectBrokerEdgeHandler(surface: Surface, env: Environment, dependencies: Dependencies = {}) {
  const runtimeFactory = dependencies.runtimeFactory ?? createStagingPostgresRuntime
  const repositoryFactory = dependencies.repositoryFactory ?? createCustomerSubjectBrokerRepository
  const coreFactory = dependencies.coreFactory ?? createCustomerSubjectBroker
  return async (request: Request): Promise<Response> => {
    let runtime: ReturnType<RuntimeFactory> | undefined
    try {
      const password = env.TLL_STAGING_BROKER_DATABASE_PASSWORD
      const clientSecret = env.TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET
      const caPem = env.TLL_STAGING_POSTGRES_CA_PEM, caSha = env.TLL_STAGING_POSTGRES_CA_SHA256
      if (env.TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED !== 'true' || env.SUPABASE_URL !== PROJECT_URL
        || !secret(password) || !secret(clientSecret) || password === clientSecret
        || !caPem || !caSha || !/^[a-f0-9]{64}$/.test(caSha)) return fixed()
      runtime = runtimeFactory({ purpose: 'broker', enabled: true, password,
        tlsCa: { pem: caPem, sha256: caSha } })
      if (!runtime.enabled) return fixed()
      const repository = repositoryFactory({ pool: runtime.pool, syntheticExecution: true, liveEnabled: false })
      const unavailable = async () => null
      const core = coreFactory({ clientSecret, syntheticExecution: true, liveEnabled: false, ports: {
        repository, currentBrowser: unavailable, serverRegistration: unavailable, currentSession: unavailable,
        verifiedShopifySubject: unavailable, now: Date.now,
      } })
      const output = surface === 'token'
        ? await core.token({ method: request.method, headers: headers(request), body: await boundedBody(request) })
        : await core.userinfo({ method: request.method, headers: headers(request) })
      const closing = runtime; runtime = undefined; await closing.close()
      return response(output)
    } catch {
      if (runtime) try { await runtime.close() } catch { /* fixed response below */ }
      return fixed()
    }
  }
}

export function edgeEnvironment(): Environment {
  const deno = (globalThis as unknown as { Deno?: { env?: { get(name: string): string | undefined } } }).Deno
  const get = (name: string) => deno?.env?.get(name)
  return Object.freeze({ SUPABASE_URL: get('SUPABASE_URL'),
    TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED: get('TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED'),
    TLL_STAGING_BROKER_DATABASE_PASSWORD: get('TLL_STAGING_BROKER_DATABASE_PASSWORD'),
    TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET: get('TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET'),
    TLL_STAGING_POSTGRES_CA_PEM: get('TLL_STAGING_POSTGRES_CA_PEM'),
    TLL_STAGING_POSTGRES_CA_SHA256: get('TLL_STAGING_POSTGRES_CA_SHA256') })
}
