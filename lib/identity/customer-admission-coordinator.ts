// Unmounted Node/server orchestration. No routes, cookies or provider activation.
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'
import type { SupabaseSessionProof } from './customer-connection'
import { createCustomerProvisionalAdmissionRepository, createProvisionalAdmissionMetadata,
  type ProvisionalAdmissionBinding, type ProvisionalAdmissionMetadata } from './customer-provisional-admission-repository'
import { createStagingSupabaseSessionReader, type SupabaseSessionTransport } from './supabase-session-proof'
import { createSupabaseAuthorizationAdmission, type SupabaseAdmissionTransport } from './supabase-authorization-admission'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const opaque = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value)
const originValid = (value: unknown): value is string => typeof value === 'string' && value.length <= 253
  && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(value) && new URL(value).origin === value
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const clock = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 253402300499999
const unavailable = () => new Error('Customer admission held')
const requireValue: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const bindingOf = (m: ProvisionalAdmissionMetadata): Readonly<ProvisionalAdmissionBinding> => Object.freeze({ transactionId: m.transactionId,
  browserHash: m.browserHash, configHash: m.configHash, intentHash: m.intentHash, applicationPkceChallenge: m.applicationPkceChallenge })

/** Server-private results. Neither this candidate nor metadata recovery permits a
 * browser redirect. The separate acknowledged 008-to-007 bridge is still required. */
export type CustomerAdmissionResult = {
  status: 'private_admission_candidate'; binding: Readonly<ProvisionalAdmissionBinding>
  claim: Readonly<{ operationId: string; fence: string; generation: string }>
  admission: Readonly<{ authorizationUrl: string; authorizationQuery: string }>
} | {
  status: 'held'; binding: Readonly<ProvisionalAdmissionBinding> | null
  quarantine: 'acknowledged' | 'unacknowledged' | 'not_required'
}
type BrowserInput = { browserSecret: string }
const earlyHeld = (): CustomerAdmissionResult => Object.freeze({ status: 'held', binding: null, quarantine: 'not_required' })

/** Supply a dedicated bounded idle-client pool, distinct provisional vault and
 * request-scoped SSR access-token accessor. BrowserInput is trusted server
 * extraction of a server-created canonical 32-byte HttpOnly transaction cookie;
 * never a form/query token, browser-chosen owner or generic getSession proof.
 * This module generates the transaction and application PKCE exactly once.
 * syntheticExecution permits local fixtures only; liveEnabled always fails shut.
 */
export function createCustomerAdmissionCoordinator(options: {
  pool: CustomerRepositoryPool; vault: EnvelopeVault; applicationOrigin: string; publishableKey?: string
  readAccessToken(): Promise<string | null>
  syntheticExecution?: boolean; liveEnabled?: boolean
  sessionTransport?: SupabaseSessionTransport; admissionTransport?: SupabaseAdmissionTransport
  now?: () => number; timeoutMs?: number; transactionExpiresAt?: number
}) {
  const { pool, vault, applicationOrigin, publishableKey, readAccessToken, sessionTransport, admissionTransport } = options
  const now = options.now ?? Date.now, timeoutMs = options.timeoutMs ?? 5000, transactionExpiresAt = options.transactionExpiresAt
  const enabled = options.syntheticExecution === true && options.liveEnabled !== true
  const active = () => enabled && typeof window === 'undefined' && originValid(applicationOrigin)
    && typeof publishableKey === 'string' && /^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
    && typeof readAccessToken === 'function' && Number.isInteger(timeoutMs) && timeoutMs >= 50 && timeoutMs <= 10_000
    && (transactionExpiresAt === undefined || (clock(transactionExpiresAt) && transactionExpiresAt > now()))
  // Lazy construction keeps invalid/default-disabled calls away from all ports.
  const repository = () => createCustomerProvisionalAdmissionRepository({ pool, vault, applicationOrigin, syntheticExecution: true })
  const admission = createSupabaseAuthorizationAdmission({ enabled, applicationOrigin, publishableKey, transport: admissionTransport, timeoutMs })
  let started = false
  function fresh(proof: SupabaseSessionProof, metadata?: ProvisionalAdmissionMetadata) {
    const at = now()
    return clock(at) && at >= proof.checkedAt && at - proof.checkedAt <= 5000 && at >= proof.authenticatedAt
      && at - proof.authenticatedAt <= 300000 && proof.expiresAt > at
      && (!metadata || (at >= metadata.createdAt && at < metadata.expiresAt))
  }
  async function verifyOriginal(expected?: string) {
    let retained = expected
    const reader = createStagingSupabaseSessionReader({ enabled: true, publishableKey, transport: sessionTransport, now, timeoutMs,
      readAccessToken: async () => {
        const token = await readAccessToken()
        if (retained === undefined && typeof token === 'string') retained = token
        requireValue(typeof token === 'string' && token === retained)
        return token
      } })
    const proof = await reader.currentSession()
    requireValue(proof && retained && fresh(proof))
    return { proof, token: retained }
  }
  async function tokenStillMatches(token: string) {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      requireValue(await Promise.race([readAccessToken(), new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), timeoutMs) })]) === token)
    } finally { clearTimeout(timer) }
  }
  async function start(input: BrowserInput, mode: 'sign_in' | 'migration'): Promise<CustomerAdmissionResult> {
    if (!active() || started || !object(input) || Object.keys(input).join(',') !== 'browserSecret' || !opaque(input.browserSecret)) return earlyHeld()
    started = true // One request-scoped instance cannot start a second transaction.
    // Copy browser authority before any asynchronous work; callers cannot switch
    // the request object while session/DB work is pending.
    const browserHash = hash(input.browserSecret)
    let original: Awaited<ReturnType<typeof verifyOriginal>> | null = null
    let metadata: ProvisionalAdmissionMetadata, binding: Readonly<ProvisionalAdmissionBinding>
    let verifier: string, prepareOperation: string, claimOperation: string
    try {
      if (mode === 'migration') original = await verifyOriginal()
      const createdAt = now(); requireValue(clock(createdAt) && (transactionExpiresAt === undefined || transactionExpiresAt > createdAt))
      verifier = randomBytes(32).toString('base64url'); prepareOperation = randomUUID(); claimOperation = randomUUID()
      metadata = createProvisionalAdmissionMetadata({ transactionId: randomUUID(), browserHash, applicationOrigin, mode,
        original: original ? { userId: original.proof.userId, sessionId: original.proof.sessionId, accessTokenHash: hash(original.token) } : null,
        applicationPkceChallenge: createHash('sha256').update(verifier).digest('base64url'), createdAt,
        expiresAt: Math.min(createdAt + 300000, transactionExpiresAt ?? Infinity) })
      if (metadata.original) Object.freeze(metadata.original)
      Object.freeze(metadata); binding = bindingOf(metadata)
    } catch { return earlyHeld() }
    const repo = repository()
    let operationId = prepareOperation, claim: { fence: string; generation: string } | undefined
    try {
      requireValue(now() < metadata.expiresAt)
      // SQL checks this immutable expiry again after its connection/gate wait.
      requireValue(await repo.prepare({ operationId, metadata, applicationPkceVerifier: verifier }))
      operationId = claimOperation
      // A DB wait can outlive the initial proof. Verify the exact original token
      // again rather than accepting metadata or a caller-supplied currentSession.
      const current = original ? await verifyOriginal(original.token) : null
      if (current) requireValue(current.proof.userId === metadata.original!.userId && current.proof.sessionId === metadata.original!.sessionId
        && hash(current.token) === metadata.original!.accessTokenHash && fresh(current.proof, metadata))
      const claimed = await repo.claimAdmission({ ...binding, operationId,
        currentMigrationProof: current ? { ...current.proof, accessTokenHash: hash(current.token) } : null })
      requireValue(claimed.status === 'claimed')
      requireValue(JSON.stringify(claimed.snapshot.metadata) === JSON.stringify(metadata))
      claim = { fence: claimed.snapshot.fence, generation: claimed.snapshot.generation }
      if (current) {
        await tokenStillMatches(current.token)
        requireValue(fresh(current.proof, metadata))
      }
      const at = now(); requireValue(clock(at) && at >= metadata.createdAt && at < metadata.expiresAt)
      const candidate = current
        ? await admission.authorizeMigration({ applicationPkceChallenge: binding.applicationPkceChallenge, accessToken: current.token })
        : await admission.authorizeSignIn({ applicationPkceChallenge: binding.applicationPkceChallenge })
      requireValue(await repo.finishAdmission({ ...binding, operationId, ...claim, admission: candidate }))
      return Object.freeze({ status: 'private_admission_candidate', binding,
        claim: Object.freeze({ operationId, ...claim }), admission: candidate })
    } catch {
      let quarantine: 'acknowledged' | 'unacknowledged' = 'unacknowledged'
      try { await repo.holdOperation({ ...binding, operationId, ...claim }); quarantine = 'acknowledged' } catch { /* original binding retained; never retry */ }
      return Object.freeze({ status: 'held', binding, quarantine })
    }
  }
  return Object.freeze({
    liveEnabled: false as const,
    startSignIn(input: BrowserInput) { return start(input, 'sign_in') },
    startMigration(input: BrowserInput) { return start(input, 'migration') },
    /** Metadata inspection cannot resume admission, recreate a verifier, expose
     * an outer URL or turn a lost acknowledgement into dispatch authority. */
    async inspect(input: { binding: ProvisionalAdmissionBinding; browserSecret: string }) {
      try {
        if (!active() || !object(input) || Object.keys(input).sort().join(',') !== 'binding,browserSecret' || !opaque(input.browserSecret)
          || !object(input.binding) || input.binding.browserHash !== hash(input.browserSecret)) return null
        const b = Object.freeze({ transactionId: input.binding.transactionId, browserHash: input.binding.browserHash,
          configHash: input.binding.configHash, intentHash: input.binding.intentHash, applicationPkceChallenge: input.binding.applicationPkceChallenge })
        const snapshot = await repository().readIntent(b)
        if (!snapshot) return null
        return Object.freeze({ status: 'metadata_only' as const, binding: b, state: snapshot.state, observedAt: snapshot.observedAt,
          expiresAt: snapshot.metadata?.expiresAt ?? null })
      } catch { return null }
    },
  })
}
