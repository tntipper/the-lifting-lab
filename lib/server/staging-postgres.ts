// Node-only transport. No connection, credential lookup or provider work at import.
import { checkServerIdentity } from 'node:tls'
import { Buffer } from 'node:buffer'
import { X509Certificate, createHash } from 'node:crypto'
import type { PoolConfig } from 'pg'

export const STAGING_POSTGRES_PROJECT_REF = 'qdmvngjwkcsilzmqksme'
export const STAGING_POSTGRES_HOST = 'aws-0-eu-west-2.pooler.supabase.com'
// Each repository receives its own credential and narrowly delegated role.
// A purpose never grants authority; these LOGIN roles require separate provisioning.
const runtimeUsers = Object.freeze({
  customer: 'tll_customer_runtime', cart: 'tll_cart_runtime',
  broker: 'tll_broker_runtime', provisional: 'tll_provisional_runtime',
  bridge: 'tll_bridge_runtime',
})
export const STAGING_POSTGRES_LIMITS = Object.freeze({
  connectMs: 3_000, acquireMs: 4_000, queryMs: 12_000, leaseMs: 30_000,
  closeMs: 2_000, idleMs: 10_000, maxLifetimeSeconds: 300, maxPending: 2,
})
export type StagingPostgresClient = {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  release(destroy?: boolean): void
}
export type StagingPostgresPool = { connect(): Promise<StagingPostgresClient> }
export type StagingPostgresRuntime = {
  readonly enabled: boolean
  readonly pool: StagingPostgresPool
  close(): Promise<void>
}
export type StagingPostgresOptions = {
  purpose: keyof typeof runtimeUsers
  enabled?: boolean
  password?: string
  /** Public CA only, obtained/approved separately. Hash covers certificate DER. */
  tlsCa?: { pem: string; sha256: string }
}
/** Trusted offline fixture seam, never an alternate endpoint/configuration API.
 * Real callers omit it. A supplied driver is arbitrary server code, not a sandbox. */
export type StagingPostgresTestDriver = {
  createPool(config: PoolConfig): Promise<DriverPool> | DriverPool
}
type DriverClient = StagingPostgresClient & {
  getTransactionStatus(): 'I' | 'T' | 'E' | null
  on(event: 'error', listener: () => void): unknown
  removeListener(event: 'error', listener: () => void): unknown
}
type DriverPool = {
  connect(): Promise<DriverClient>
  end(): Promise<void>
  on(event: 'error', listener: () => void): unknown
}
const unavailable = () => new Error('Staging database unavailable')
/** Public CA DER bytes from a single PEM certificate (no private material). */
function derBytesFromPem(pem: string): Buffer {
  const body = pem.replace(/^-----BEGIN CERTIFICATE-----/, '')
    .replace(/-----END CERTIFICATE-----\s*$/, '')
    .replace(/\s+/g, '')
  if (!body || body.length > 24_000 || /[^A-Za-z0-9+/=]/.test(body)) throw unavailable()
  const der = Buffer.from(body, 'base64')
  if (der.byteLength < 64 || der.byteLength > 16_384) throw unavailable()
  return der
}
/** Deno Edge may expose both `window` and `process.env` under node-compat.
 * Treat an explicit Deno global as a non-browser host and only fail closed on
 * PG* or TLS overrides. Browser bundles (no Deno) still fail on `window`. */
const serverEnvironmentSafe = () => {
  const isDeno = typeof (globalThis as { Deno?: unknown }).Deno !== 'undefined'
  if (!isDeno && typeof window !== 'undefined') return false
  const proc = (globalThis as { process?: { env?: NodeJS.ProcessEnv } }).process
  if (proc == null || proc.env == null) return true
  const env = proc.env
  return !Object.keys(env).some(key => key.startsWith('PG') && !!env[key])
    && !env.NODE_PG_FORCE_NATIVE && env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
}

/** Fixed staging transaction-pooler transport. Explicit enable permits connection
 * attempts only; it does not activate SQL controls, provider routes or live use. */
export function createStagingPostgresRuntime(input: StagingPostgresOptions, fixture?: StagingPostgresTestDriver): StagingPostgresRuntime {
  const enabled = input?.enabled === true
  if (!enabled) return Object.freeze({ enabled: false, pool: Object.freeze({ async connect() { throw unavailable() } }), async close() {} })
  if (!serverEnvironmentSafe() || typeof input.purpose !== 'string' || !Object.hasOwn(runtimeUsers, input.purpose)
    || typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 1024
    || /[\x00-\x1f\x7f]/.test(input.password)) throw unavailable()
  let ca: string | undefined
  if (input.tlsCa !== undefined) {
    try {
      const supplied = input.tlsCa
      if (!supplied || typeof supplied.pem !== 'string' || supplied.pem.length > 16_384
        || !/^[a-f0-9]{64}$/.test(supplied.sha256)
        || !/^-----BEGIN CERTIFICATE-----[\s\S]+-----END CERTIFICATE-----\s*$/.test(supplied.pem)
        || (supplied.pem.match(/-----BEGIN CERTIFICATE-----/g) ?? []).length !== 1) throw unavailable()
      const certificate = new X509Certificate(supplied.pem)
      // Deno Edge stubs X509Certificate.raw; PEM→DER is the standard digest input.
      const der = derBytesFromPem(supplied.pem)
      if (!certificate.ca || createHash('sha256').update(der).digest('hex') !== supplied.sha256
        || Date.parse(certificate.validFrom) > Date.now() || Date.parse(certificate.validTo) <= Date.now()) throw unavailable()
      ca = supplied.pem
    } catch { throw unavailable() }
  }
  // Snapshot only the reviewed fields. Never spread caller configuration or parse
  // a connection string (which can replace pg's carefully supplied TLS options).
  const config: PoolConfig = {
    host: STAGING_POSTGRES_HOST, port: 6543, database: 'postgres',
    user: `${runtimeUsers[input.purpose]}.${STAGING_POSTGRES_PROJECT_REF}`, password: input.password,
    ssl: { ...(ca ? { ca } : {}), rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: STAGING_POSTGRES_HOST,
      checkServerIdentity(hostname, cert) {
        if (hostname !== STAGING_POSTGRES_HOST || checkServerIdentity(STAGING_POSTGRES_HOST, cert)) return unavailable()
      } },
    sslnegotiation: 'postgres', enableChannelBinding: true, client_encoding: 'UTF8',
    application_name: `tll-staging-${input.purpose}`, pipeline: false,
    connectionTimeoutMillis: STAGING_POSTGRES_LIMITS.connectMs,
    query_timeout: STAGING_POSTGRES_LIMITS.queryMs,
    statement_timeout: 10_000, lock_timeout: 5_000, idle_in_transaction_session_timeout: 15_000,
    max: 1, min: 0, maxUses: 100, maxLifetimeSeconds: STAGING_POSTGRES_LIMITS.maxLifetimeSeconds,
    idleTimeoutMillis: STAGING_POSTGRES_LIMITS.idleMs, allowExitOnIdle: true,
    keepAlive: true, keepAliveInitialDelayMillis: 10_000,
    log: () => {}, // pg can otherwise pass raw errors/client objects to custom logs.
  }
  let closed = false, driver: Promise<DriverPool> | undefined, rawPool: DriverPool | undefined
  let closing: Promise<void> | undefined, endingDriver: Promise<void> | undefined
  const leases = new Set<() => void>(), acquiring = new Set<() => void>()
  function endDriver(): Promise<void> {
    if (!rawPool) return Promise.resolve()
    return endingDriver ??= Promise.resolve().then(() => rawPool!.end())
  }
  function getDriver(): Promise<DriverPool> {
    if (!driver) driver = (async () => {
      if (!serverEnvironmentSafe() || closed) throw unavailable()
      const createPool = fixture?.createPool ?? (async (cfg: PoolConfig) => {
        // Lazy loading also prevents NODE_PG_FORCE_NATIVE from taking effect at
        // module import. Recheck immediately before creating the actual driver.
        const { Pool } = await import('pg')
        if (!serverEnvironmentSafe() || closed) throw unavailable()
        return new Pool(cfg)
      })
      const pool = await createPool(config)
      // An idle pg error already removes that connection. Handle it without raw
      // logs, unhandled EventEmitter errors, error causes or automatic operation retry.
      pool.on('error', () => {})
      rawPool = pool
      if (closed) { await endDriver(); throw unavailable() }
      return pool
    })().catch(() => { throw unavailable() })
    return driver
  }
  function lease(raw: DriverClient): StagingPostgresClient {
    let released = false, busy = false, cancelQuery: (() => void) | undefined
    const onError = () => release(true)
    const deadline = setTimeout(onError, STAGING_POSTGRES_LIMITS.leaseMs)
    const destroy = () => release(true)
    leases.add(destroy)
    raw.on('error', onError)
    function release(force = false) {
      if (released) return
      released = true
      clearTimeout(deadline); leases.delete(destroy)
      cancelQuery?.()
      // Only a fully acknowledged idle session can re-enter the pool. A caller
      // forgetting COMMIT/ROLLBACK cannot leave a transaction for the next owner.
      let discard = force || busy
      try { discard ||= raw.getTransactionStatus() !== 'I' } catch { discard = true }
      try { raw.removeListener('error', onError); raw.release(discard) } catch { /* never expose driver details */ }
    }
    return Object.freeze({
      release,
      async query(text: string, values?: unknown[]) {
        if (released || closed || busy || typeof text !== 'string' || !text.trim()
          || (values !== undefined && !Array.isArray(values))) { release(true); throw unavailable() }
        busy = true
        return new Promise<{ rows: Record<string, unknown>[] }>((resolve, reject) => {
          let settled = false
          const fail = () => {
            if (settled) return
            settled = true; clearTimeout(timer); cancelQuery = undefined
            release(true); reject(unavailable())
          }
          const timer = setTimeout(fail, STAGING_POSTGRES_LIMITS.queryMs)
          cancelQuery = fail
          // String + positional values only: callers cannot submit query config,
          // a named statement, callbacks, streams or a second concurrent query.
          Promise.resolve().then(() => {
            if (released) throw unavailable()
            return raw.query(text, values)
          }).then(result => {
            if (settled) return
            if (!result || !Array.isArray(result.rows)) { fail(); return }
            settled = true; clearTimeout(timer); cancelQuery = undefined; busy = false
            resolve({ rows: result.rows })
          }, fail)
        })
      },
    })
  }
  const pool: StagingPostgresPool = Object.freeze({
    async connect() {
      if (closed || !serverEnvironmentSafe() || acquiring.size >= STAGING_POSTGRES_LIMITS.maxPending) throw unavailable()
      return new Promise<StagingPostgresClient>((resolve, reject) => {
        let pending = true
        const fail = () => {
          if (!pending) return
          pending = false; clearTimeout(timer); acquiring.delete(fail); reject(unavailable())
        }
        const timer = setTimeout(fail, STAGING_POSTGRES_LIMITS.acquireMs)
        acquiring.add(fail)
        getDriver().then(async pg => {
          if (!pending || closed) return
          let raw: DriverClient
          try { raw = await pg.connect() } catch { fail(); return }
          if (!pending || closed) { try { raw.release(true) } catch {} return }
          try {
            if (raw.getTransactionStatus() !== 'I') { raw.release(true); fail(); return }
            const client = lease(raw)
            pending = false; clearTimeout(timer); acquiring.delete(fail); resolve(client)
          } catch { try { raw.release(true) } catch {} fail() }
        }, fail)
      })
    },
  })
  return Object.freeze({ enabled: true, pool,
    close() {
      if (closing) return closing
      closed = true
      for (const cancel of acquiring) cancel()
      for (const destroy of leases) destroy()
      closing = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(unavailable()), STAGING_POSTGRES_LIMITS.closeMs)
        Promise.resolve().then(async () => {
          try { await driver } catch { /* failed/late creation still needs cleanup */ }
          await endDriver()
        }).then(() => { clearTimeout(timer); resolve() }, () => { clearTimeout(timer); reject(unavailable()) })
      })
      return closing
    },
  })
}
