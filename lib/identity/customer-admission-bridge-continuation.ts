// Unmounted server continuation. No cookie delivery, routes or login completion.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'
import type { SupabaseSessionProof } from './customer-connection'
import { createCustomerAdmissionCoordinator } from './customer-admission-coordinator'
import { createCustomerProvisionalAdmissionRepository, type ProvisionalAdmissionBinding,
  type ProvisionalAdmissionMetadata } from './customer-provisional-admission-repository'
import { createStagingSupabaseSessionReader, type SupabaseSessionTransport } from './supabase-session-proof'
import type { SupabaseAdmissionTransport } from './supabase-authorization-admission'

const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v)
const integer = (v: unknown, zero = false): v is string => typeof v === 'string' && (zero ? /^(0|[1-9][0-9]{0,18})$/ : /^[1-9][0-9]{0,18}$/).test(v) && BigInt(v) <= BigInt('9223372036854775807')
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= 253402300499999
const exact = (v: unknown, keys: string): v is Record<string, unknown> => object(v) && Object.keys(v).sort().join(',') === keys
const unavailable = () => new Error('Customer bridge held')
const ensure: (v: unknown) => asserts v = v => { if (!v) throw unavailable() }
const originValid = (v: unknown): v is string => typeof v === 'string' && v.length <= 253
  && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(v) && new URL(v).origin === v

export type CustomerBridgeBinding = Readonly<ProvisionalAdmissionBinding & {
  admissionOperationId: string; admissionFence: string; generation: string; outerHash: string
}>
export type CustomerBridgeRecovery = Readonly<{ binding: CustomerBridgeBinding; registrationOperationId: string }>
type BrowserInput = { browserSecret: string }
type BoundInput = BrowserInput & { recovery: CustomerBridgeRecovery }
type Held = { status: 'held'; binding: Readonly<ProvisionalAdmissionBinding> | null; recovery: CustomerBridgeRecovery | null
  quarantine: 'acknowledged' | 'unacknowledged' | 'not_required' }
export type CustomerBridgeResult = Held | { status: 'private_registered'; recovery: CustomerBridgeRecovery
  expiresAt: number; authorizationUrl: string; releaseSecret: string }
const early = (): Held => Object.freeze({ status: 'held', binding: null, recovery: null, quarantine: 'not_required' })

/** Explicit ordered v1 digest. Only trusted server extraction may call this with
 * a retained private recovery tuple and server-created release cookie. A hash is
 * not browser authentication, and no cookie delivery exists in this module. */
export function customerBridgeReleaseHash(secret: string, recovery: CustomerBridgeRecovery): string {
  ensure(opaque(secret)); const r = captureRecovery(recovery), b = r.binding
  return hash(JSON.stringify(['tll-bridge-release/v1', secret, b.transactionId, b.browserHash, b.configHash, b.intentHash,
    b.applicationPkceChallenge, b.admissionOperationId, b.admissionFence, b.generation, b.outerHash, r.registrationOperationId]))
}
function captureRecovery(value: CustomerBridgeRecovery): CustomerBridgeRecovery {
  ensure(exact(value, 'binding,registrationOperationId') && uuid(value.registrationOperationId))
  const b = value.binding
  ensure(exact(b, 'admissionFence,admissionOperationId,applicationPkceChallenge,browserHash,configHash,generation,intentHash,outerHash,transactionId')
    && uuid(b.transactionId) && sha(b.browserHash) && sha(b.configHash) && sha(b.intentHash) && opaque(b.applicationPkceChallenge)
    && uuid(b.admissionOperationId) && integer(b.admissionFence) && integer(b.generation, true) && sha(b.outerHash)
    && value.registrationOperationId !== b.admissionOperationId)
  return Object.freeze({ binding: Object.freeze({ transactionId: b.transactionId, browserHash: b.browserHash, configHash: b.configHash,
    intentHash: b.intentHash, applicationPkceChallenge: b.applicationPkceChallenge, admissionOperationId: b.admissionOperationId,
    admissionFence: b.admissionFence, generation: b.generation, outerHash: b.outerHash }), registrationOperationId: value.registrationOperationId })
}

/** Both pools exclusively lease bounded idle clients; bridgePool has only the
 * narrow 010 executor. HTTP/session verification precedes bridge SQL. The real
 * owned coordinator is the sole source of admission ACK authority: no public
 * continue(candidate), proof injection or metadata-to-registration API exists.
 * Browser inputs are trusted extraction of server-created private cookies.
 * All live activation remains disabled even when syntheticExecution is true. */
export function createCustomerAdmissionBridgeContinuation(options: {
  provisionalPool: CustomerRepositoryPool; bridgePool: CustomerRepositoryPool; vault: EnvelopeVault
  applicationOrigin: string; publishableKey?: string; readAccessToken(): Promise<string | null>
  syntheticExecution?: boolean; liveEnabled?: boolean; sessionTransport?: SupabaseSessionTransport
  admissionTransport?: SupabaseAdmissionTransport; now?: () => number; timeoutMs?: number; transactionExpiresAt?: number
}) {
  const { provisionalPool, bridgePool, vault, applicationOrigin, publishableKey, readAccessToken, sessionTransport, admissionTransport } = options
  const now = options.now ?? Date.now, timeoutMs = options.timeoutMs ?? 5000, transactionExpiresAt = options.transactionExpiresAt
  const enabled = options.syntheticExecution === true && options.liveEnabled !== true
  const active = () => enabled && typeof window === 'undefined' && originValid(applicationOrigin)
    && typeof publishableKey === 'string' && /^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
    && typeof readAccessToken === 'function' && Number.isInteger(timeoutMs) && timeoutMs >= 50 && timeoutMs <= 10000
  const coordinator = createCustomerAdmissionCoordinator({ pool: provisionalPool, vault, applicationOrigin, publishableKey, readAccessToken,
    syntheticExecution: enabled, sessionTransport, admissionTransport, now, timeoutMs, transactionExpiresAt })
  const repository = () => createCustomerProvisionalAdmissionRepository({ pool: provisionalPool, vault, applicationOrigin, syntheticExecution: true })
  let started = false
  function bound(input: BoundInput) {
    ensure(active() && exact(input, 'browserSecret,recovery') && opaque(input.browserSecret))
    const recovery = captureRecovery(input.recovery)
    ensure(recovery.binding.browserHash === hash(input.browserSecret) && recovery.binding.configHash === repository().configHash)
    return recovery
  }
  function fresh(proof: SupabaseSessionProof, m: ProvisionalAdmissionMetadata) {
    const at = now()
    return ms(at) && at >= m.createdAt && at < m.expiresAt && at >= proof.checkedAt && at - proof.checkedAt < 5000
      && at >= proof.authenticatedAt && at - proof.authenticatedAt < 300000 && proof.expiresAt > at
  }
  async function sameToken(token: string) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try { ensure(await Promise.race([readAccessToken(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) })]) === token) }
    finally { clearTimeout(timer) }
  }
  async function call(op: 'register' | 'hold' | 'cancel' | 'inspect', payload: object,
    validate: (r: Record<string, unknown>) => void, beforeBegin?: () => Promise<void>) {
    ensure(active()); const wire = JSON.stringify(payload); ensure(Buffer.byteLength(wire) <= 16384)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined, result: Record<string, unknown> | undefined, failed = false
    try {
      client = await bridgePool.connect()
      await beforeBegin?.()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const response = await client.query('SELECT tll_bridge_private.repository($1::text, $2::jsonb) AS result', [op, wire])
      ensure(response.rows.length === 1 && object(response.rows[0].result)); result = response.rows[0].result
      validate(result)
      await client.query('COMMIT')
    } catch { failed = true; try { await client?.query('ROLLBACK') } catch { /* discard uncertainty */ } }
    finally { try { client?.release(failed) } catch { failed = true } }
    if (failed || !result) throw unavailable()
    return result
  }
  const status = (expected: string) => (r: Record<string, unknown>) => ensure(exact(r, 'status') && (r.status === expected || r.status === 'rejected'))
  async function quarantine(recovery: CustomerBridgeRecovery, operationId = recovery.registrationOperationId): Promise<Held> {
    let acknowledged = false
    try { acknowledged = (await call('hold', { ...recovery.binding, operationId }, status('held'))).status === 'held' }
    catch { /* exactly one hold attempt; metadata inspection never retries it */ }
    return Object.freeze({ status: 'held', binding: recovery.binding, recovery, quarantine: acknowledged ? 'acknowledged' : 'unacknowledged' })
  }
  async function start(input: BrowserInput, mode: 'sign_in' | 'migration'): Promise<CustomerBridgeResult> {
    if (!active() || started || !exact(input, 'browserSecret') || !opaque(input.browserSecret)) return early()
    started = true; const browserSecret = input.browserSecret
    const candidate = await (mode === 'sign_in' ? coordinator.startSignIn({ browserSecret }) : coordinator.startMigration({ browserSecret }))
    if (candidate.status === 'held') return Object.freeze({ ...candidate, recovery: null })
    // Only the actual coordinator's immediately acknowledged finish reaches this
    // code. Capture original authority before the first asynchronous read.
    const q = new URLSearchParams(candidate.admission.authorizationQuery)
    const outer = [q.get('client_id'), q.get('redirect_uri'), q.get('state'), q.get('scope'), q.get('code_challenge'), q.get('code_challenge_method')]
    const recovery = captureRecovery({ binding: { ...candidate.binding, admissionOperationId: candidate.claim.operationId,
      admissionFence: candidate.claim.fence, generation: candidate.claim.generation, outerHash: hash(JSON.stringify(outer)) }, registrationOperationId: randomUUID() })
    const releaseSecret = randomBytes(32).toString('base64url'), releaseHash = customerBridgeReleaseHash(releaseSecret, recovery)
    const authorizationUrl = candidate.admission.authorizationUrl
    try {
      const s = await repository().readIntent(candidate.binding), b = recovery.binding
      ensure(s && s.metadata && s.outer && s.state === 'admitted' && s.generation === b.generation && s.outerHash === b.outerHash
        && s.metadata.mode === mode && s.metadata.applicationOrigin === applicationOrigin && b.browserHash === hash(browserSecret)
        && ['transactionId','browserHash','configHash','intentHash','applicationPkceChallenge'].every(k => s[k as keyof typeof s] === b[k as keyof typeof b]))
      const m = s.metadata, o = s.outer
      ensure(JSON.stringify([o.clientId,o.redirectUri,o.state,o.scope,o.challenge,o.method]) === JSON.stringify(outer)
        && authorizationUrl === applicationOrigin + '/auth/customer/authorize?' + candidate.admission.authorizationQuery)
      const at = now(); ensure(ms(at) && at >= m.createdAt && at < m.expiresAt
        && (transactionExpiresAt === undefined || m.expiresAt <= transactionExpiresAt))
      let proof: SupabaseSessionProof | null = null, token: string | undefined
      if (mode === 'migration') {
        ensure(m.original)
        const reader = createStagingSupabaseSessionReader({ enabled: true, publishableKey, transport: sessionTransport, now, timeoutMs,
          readAccessToken: async () => { const value = await readAccessToken(); ensure(typeof value === 'string' && hash(value) === m.original!.accessTokenHash)
            if (token === undefined) token = value
            ensure(value === token); return value } })
        proof = await reader.currentSession()
        ensure(proof && token && proof.userId === m.original.userId && proof.sessionId === m.original.sessionId && fresh(proof, m))
      } else ensure(m.original === null)
      await call('register', { ...b, operationId: recovery.registrationOperationId, releaseHash,
        currentMigrationProof: proof ? { ...proof, accessTokenHash: hash(token!) } : null }, r => {
        ensure(exact(r, 'expiresAt,status,transactionId') && r.status === 'registered' && r.transactionId === b.transactionId && r.expiresAt === m.expiresAt)
      }, async () => {
        if (proof) { await sameToken(token!); ensure(fresh(proof, m)) }
        const before = now(); ensure(ms(before) && before >= m.createdAt && before < m.expiresAt)
      })
      // A late acknowledgement or SSR account change cannot release stale
      // authority. Quarantine the same committed operation if either changed.
      if (proof) { await sameToken(token!); ensure(fresh(proof, m)) }
      const releasedAt = now(); ensure(ms(releasedAt) && releasedAt >= m.createdAt && releasedAt < m.expiresAt)
      return Object.freeze({ status: 'private_registered', recovery, expiresAt: m.expiresAt, authorizationUrl, releaseSecret })
    } catch { return quarantine(recovery) }
  }
  return Object.freeze({
    liveEnabled: false as const,
    startSignIn(input: BrowserInput) { return start(input, 'sign_in') },
    startMigration(input: BrowserInput) { return start(input, 'migration') },
    async hold(input: BoundInput): Promise<Held> { try { return await quarantine(bound(input)) } catch { return early() } },
    async cancel(input: BoundInput): Promise<Held | { status: 'cancelled'; recovery: CustomerBridgeRecovery }> {
      let recovery: CustomerBridgeRecovery
      try { recovery = bound(input) } catch { return early() }
      const operationId = randomUUID()
      try { if ((await call('cancel', { ...recovery.binding, operationId }, status('cancelled'))).status === 'cancelled') return Object.freeze({ status: 'cancelled', recovery }) }
      catch { return quarantine(recovery, operationId) }
      return Object.freeze({ status: 'held', binding: recovery.binding, recovery, quarantine: 'unacknowledged' })
    },
    async inspect(input: BoundInput) {
      try {
        const recovery = bound(input)
        const r = await call('inspect', recovery.binding, r => {
          if (exact(r, 'status') && r.status === 'rejected') return
          ensure(exact(r, 'epochCurrent,expiresAt,observedAt,state,status') && r.status === 'metadata_only'
            && ['pending_browser','browser_admitted','held','cancelled'].includes(r.state as string)
            && ms(r.expiresAt) && ms(r.observedAt) && typeof r.epochCurrent === 'boolean')
        })
        return r.status === 'metadata_only' ? Object.freeze({ status: 'metadata_only' as const, state: r.state as string,
          expiresAt: r.expiresAt as number, observedAt: r.observedAt as number, epochCurrent: r.epochCurrent as boolean }) : null
      } catch { return null }
    },
  })
}
