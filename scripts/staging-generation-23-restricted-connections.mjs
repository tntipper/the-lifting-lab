/**
 * Disabled proof that the five temporary Gen23 database logins work only as
 * their assigned roles. The worker owns the projected passwords in memory;
 * this module never reads, writes, or reports them.
 */
import { verifyGeneration6Connections } from './staging-generation-6-connection-verifier.mjs'
import { readPinnedSupabaseCa } from './staging-supabase-ca.mjs'
import { ACTIVE_WINDOW_EXPIRES_AT } from './staging-generation-23-credentials.mjs'
import { PASSWORD_PURPOSES } from './staging-generation-22-material.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'
import { IDENTITIES } from './staging-generation-6-credentials.mjs'
import { checkServerIdentity } from 'node:tls'

export const STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED = false
export const STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS = 140_000
export const STAGING_GENERATION_23_WRONG_PASSWORD_CONNECT_MS = 3_000
const STAGING_POOLER_HOST = 'aws-0-eu-west-2.pooler.supabase.com'
const STAGING_POOLER_PORT = 6543
const unavailable = () => { throw Error('Generation 23 restricted connection proof unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const validSignal = signal => signal && typeof signal.addEventListener === 'function'
  && typeof signal.removeEventListener === 'function'
const validPasswords = passwords => exact(passwords, PASSWORD_PURPOSES)
  && Object.values(passwords).every(value => typeof value === 'string'
    && /^[A-Za-z0-9_-]{64}$/.test(value))
  && new Set(Object.values(passwords)).size === PASSWORD_PURPOSES.length
const changedPassword = password => `${password.slice(0, -1)}${password.at(-1) === 'A' ? 'B' : 'A'}`

/**
 * A narrow raw-client probe is required because the application runtime
 * deliberately hides pg error details. It reports only the expected auth
 * denial (`28P01`), closes on every path, and never returns error text.
 */
export function createStagingGeneration23WrongPasswordProbe({ Client,
  loadClient = () => import('pg'),
  scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout,
} = {}) {
  if (!STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED || (Client !== undefined && typeof Client !== 'function')
    || typeof loadClient !== 'function'
    || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  return async function verifyWrongPassword({ purpose, password, tlsCa, signal } = {}) {
    if (!PASSWORD_PURPOSES.includes(purpose) || typeof password !== 'string'
      || !/^[A-Za-z0-9_-]{64}$/.test(password) || !tlsCa || typeof tlsCa.pem !== 'string'
      || !tlsCa.pem || !/^[a-f0-9]{64}$/.test(tlsCa.sha256) || !validSignal(signal) || signal.aborted) unavailable()
    let client, timer, closePromise, resolveOutcome
    const close = () => closePromise ??= Promise.resolve().then(async () => {
      if (client && typeof client.end === 'function') await client.end()
    }).catch(() => undefined)
    const onAbort = () => {
      void close()
      resolveOutcome?.(Object.freeze({ aborted: true }))
    }
    try {
      const ClientConstructor = Client ?? (await loadClient()).Client
      if (typeof ClientConstructor !== 'function') unavailable()
      client = new ClientConstructor({ host: STAGING_POOLER_HOST, port: STAGING_POOLER_PORT, database: 'postgres',
        user: `${IDENTITIES[purpose].login}.${PROJECT_REF}`, password,
        ssl: { ca: tlsCa.pem, rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: STAGING_POOLER_HOST,
          checkServerIdentity(hostname, certificate) {
            if (hostname !== STAGING_POOLER_HOST) unavailable()
            const verification = checkServerIdentity(STAGING_POOLER_HOST, certificate)
            if (verification) unavailable()
          } },
        sslnegotiation: 'postgres', enableChannelBinding: true, client_encoding: 'UTF8',
        application_name: `tll-staging-${purpose}`, connectionTimeoutMillis: STAGING_GENERATION_23_WRONG_PASSWORD_CONNECT_MS,
        query_timeout: 12_000, statement_timeout: 10_000, lock_timeout: 5_000,
        idle_in_transaction_session_timeout: 15_000, keepAlive: true, keepAliveInitialDelayMillis: 10_000,
      })
      if (!client || typeof client.connect !== 'function' || typeof client.end !== 'function') unavailable()
      signal.addEventListener('abort', onAbort, { once: true })
      const outcome = await new Promise(resolve => {
        resolveOutcome = resolve
        timer = scheduleTimeout(() => resolve(Object.freeze({ timeout: true })),
          STAGING_GENERATION_23_WRONG_PASSWORD_CONNECT_MS)
        Promise.resolve().then(() => client.connect()).then(
          () => resolve(Object.freeze({ connected: true })),
          error => resolve(Object.freeze({ code: error?.code })),
        )
      })
      if (signal.aborted || outcome?.code !== '28P01') unavailable()
      return Object.freeze({ code: '28P01' })
    } catch { unavailable() }
    finally {
      if (timer) clearScheduledTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      await close()
    }
  }
}

/**
 * Runs inside the credential-owning child. `verify` proves each real login's
 * role and private-table denial; this wrapper separately proves that all five
 * modified passwords cannot connect, then closes every created runtime.
 */
export function createStagingGeneration23RestrictedConnections({ createRuntime,
  verify = verifyGeneration6Connections, readCa = readPinnedSupabaseCa,
  verifyDrained, verifyWrongPassword,
  now = Date.now, scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout,
} = {}) {
  if (!STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_ENABLED || typeof createRuntime !== 'function'
    || typeof verify !== 'function' || typeof readCa !== 'function' || typeof now !== 'function'
    || typeof verifyDrained !== 'function' || (verifyWrongPassword !== undefined && typeof verifyWrongPassword !== 'function')
    || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  const wrongPasswordProbe = verifyWrongPassword ?? createStagingGeneration23WrongPasswordProbe()
  let used = false
  return Object.freeze({
    async prove({ passwords, expiresAt, deadlineAt, signal } = {}) {
      const startedAt = now(), expiresMs = Date.parse(expiresAt), deadlineMs = Date.parse(deadlineAt)
      if (used || !validSignal(signal) || signal.aborted || !validPasswords(passwords)
        || expiresAt !== ACTIVE_WINDOW_EXPIRES_AT || !Number.isFinite(startedAt)
        || !Number.isFinite(expiresMs) || !Number.isFinite(deadlineMs)
        || startedAt >= deadlineMs || deadlineMs > expiresMs
        || deadlineMs - startedAt > STAGING_GENERATION_23_RESTRICTED_CONNECTIONS_MAX_MS) unavailable()
      used = true
      const controller = new AbortController(), runtimes = new Set()
      const closeAll = async () => {
        const values = [...runtimes]
        runtimes.clear()
        const results = await Promise.allSettled(values.map(runtime => runtime.close()))
        if (results.some(result => result.status !== 'fulfilled')) unavailable()
      }
      const onAbort = () => controller.abort()
      const timeout = scheduleTimeout(onAbort, Math.max(1, deadlineMs - now()))
      signal.addEventListener('abort', onAbort, { once: true })
      const trackedRuntime = input => {
        if (controller.signal.aborted) unavailable()
        const runtime = createRuntime(input)
        if (!runtime || !runtime.pool || typeof runtime.pool.connect !== 'function'
          || typeof runtime.close !== 'function') unavailable()
        runtimes.add(runtime)
        return runtime
      }
      try {
        const tlsCa = readCa()
        const verified = await verify({ passwords, expiresAt, tlsCa, createRuntime: trackedRuntime })
        if (controller.signal.aborted || now() >= deadlineMs
          || !exact(verified, ['status', 'projectRef', 'purposes', 'controlsEnabled'])
          || verified.status !== 'PASS' || verified.projectRef !== PROJECT_REF
          || verified.purposes !== PASSWORD_PURPOSES.length || verified.controlsEnabled !== false) unavailable()
        for (const purpose of PASSWORD_PURPOSES) {
          if (controller.signal.aborted || now() >= deadlineMs) unavailable()
          let denied = false
          try {
            const result = await wrongPasswordProbe({ purpose, password: changedPassword(passwords[purpose]), tlsCa,
              signal: controller.signal })
            denied = exact(result, ['code']) && result.code === '28P01'
          } catch { denied = false }
          // The regular staging runtime intentionally sanitises raw pg errors.
          // Its `connect()` cannot distinguish authentication rejection from a
          // transport outage, so the supervised assembly must inject the
          // pinned raw probe which closes its own pool and retains only code.
          if (!denied || controller.signal.aborted || now() >= deadlineMs) unavailable()
        }
        await closeAll()
        const drained = await verifyDrained({ expiresAt, signal: controller.signal })
        if (controller.signal.aborted || now() >= deadlineMs
          || !exact(drained, ['status', 'projectRef', 'purposes', 'controlsEnabled', 'runtimeSessions'])
          || drained.status !== 'PASS_DRAINED' || drained.projectRef !== PROJECT_REF
          || drained.purposes !== PASSWORD_PURPOSES.length || drained.controlsEnabled !== false
          || drained.runtimeSessions !== 0) unavailable()
        return Object.freeze({ status: 'PASS_RESTRICTED_CONNECTIONS', projectRef: PROJECT_REF,
          purposes: PASSWORD_PURPOSES.length, controlsEnabled: false })
      } finally {
        clearScheduledTimeout(timeout)
        signal.removeEventListener('abort', onAbort)
        try { await closeAll() } catch { /* caller receives the original failed proof */ }
      }
    },
  })
}
