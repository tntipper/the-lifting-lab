// Disabled Node/server protocol core. No routes, provider, HTTP or SQL adapter.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { STAGING_SHOP_ID, STAGING_ISSUER, STAGING_SUPABASE_ISSUER, type Owner, type SupabaseSessionProof } from './customer-connection'

/** Intended public identifiers only: this does not register or approve a client. */
export const SUBJECT_BROKER_CLIENT_ID = 'tll-staging-subject-broker-v1'
export const SUBJECT_BROKER_CALLBACK = `${STAGING_SUPABASE_ISSUER}/callback`
export const SUBJECT_BROKER_SCOPE = 'subject'
const VERSION = 'tll-staging-subject-broker/1'
const ATTEMPT_MS = 300_000, PROOF_MS = 5_000, AUTH_MS = 300_000, BEARER_MS = 60_000
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
const random = () => randomBytes(32).toString('base64url')
const CONFIG_HASH = hash(JSON.stringify([VERSION, SUBJECT_BROKER_CLIENT_ID, SUBJECT_BROKER_CALLBACK, SUBJECT_BROKER_SCOPE, STAGING_SHOP_ID, STAGING_ISSUER]))
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)
const time = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20\x7f]/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v) && Buffer.from(v, 'base64url').toString('base64url') === v
const brokerSubject = (v: unknown): v is string => typeof v === 'string' && v.startsWith('tllb_') && opaque(v.slice(5))
const ownerEquals = (a: Owner, b: Owner) => a.userId === b.userId && a.sessionId === b.sessionId
const safeEqual = (a: string, b: string) => timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())

export type BrokerOuterRequest = {
  clientId: string; redirectUri: string; state: string; scope: 'subject'; challenge: string; method: 'S256'
}
export type BrokerBrowserContext = { transactionId: string; cookieSecret: string }
/** Only the server that initiated Supabase authorize/linkIdentity supplies this
 * registration. A URL presented by the browser is NOT a registration receipt.
 * It must bind the exact returned outer state to the original browser and, for
 * migration, the same session that authorized Supabase's linkIdentity call. */
export type BrokerServerRegistration = BrokerBrowserContext & {
  authorizationQuery: string; applicationPkceChallenge: string
  mode: 'sign_in' | 'migration'; target: Owner | null
}
/** Produced by a reviewed Shopify verification/vault adapter after real ID-token
 * signature/issuer/audience/nonce and inner transaction checks. Not a request DTO.
 * No token/credential enters this core, and a bare decoded subject is not proof. */
export type BrokerShopifyProof = {
  transactionId: string; receiptId: string; shopId: string; issuer: string; subject: string
  innerPkceChallenge: string; verifiedAt: number; expiresAt: number
}
export type BrokerRegistrationRecord = {
  id: string; configHash: string; browserHash: string; outer: BrokerOuterRequest; outerHash: string
  applicationPkceChallenge: string; mode: 'sign_in' | 'migration'; target: Owner | null
  createdAt: number; expiresAt: number
}
export type BrokerReadinessClaim = { status: 'claimed'; record: BrokerRegistrationRecord; fence: string; generation: string } | { status: 'rejected' }
/** Quarantine carries the original admission/credential binding, never a bare
 * locator. Transaction IDs/code/bearer hashes are never reused by a new flow. */
export type BrokerLocator = { kind: 'transaction'; id: string; browserHash: string; outerHash: string; fence?: string; generation?: string }
  | { kind: 'code'; hash: string; clientId: string; redirectUri: string; challenge: string }
  | { kind: 'bearer'; hash: string }
type Operation = { operationId: string; configHash: string }
type BrowserOperation = Operation & { transactionId: string; browserHash: string }

/** A future durable adapter must implement ALL these invariants with database
 * time, private grants, bounded calls and independent broker fence/role scope.
 * A returned success is an ACKNOWLEDGED COMMIT, never a queued/in-memory write.
 *
 * register: unique transaction and outer state, immutable exact registration,
 * no overwriting/reopening consumed/held/cancelled records. Enforce quotas.
 * admit: registered -> admitted once, exact browser/config/outer hash + expiry.
 * claimReadiness: admitted -> verifying once, returned current fence/generation.
 * finishReadiness: verifies same fence/generation/browser/config/expiry, stores
 * ONLY code hash, immutable proof/target/deadline, atomically reserves or reuses
 * unique opaque subject for exact (shop,issuer,subject). Sign-in is provisional,
 * not a new authenticated UUID. Migration records a pending target reservation,
 * not a completed link; reject conflicting bound or pending UUID reservations.
 * Sign-in must reject pending-migration subjects until authoritative promotion
 * exists; otherwise a concurrent sign-in could create a different upstream UUID.
 * No binding may be inferred from an email or from the other connection ledger.
 *
 * redeemCode: ready -> token_issued once; fixed client/callback/S256, current
 * generation and both deadlines. Store only bearer hash, expiry and the same
 * subject/readiness. A replay cannot issue another bearer; revoke an outstanding
 * bearer on detected code reuse. Never extend readiness to the bearer TTL.
 * consumeUserinfo: token_issued -> consumed once before returning sub. Check
 * expiry/readiness/cancellation/generation in the same transaction. No replay.
 *
 * holdOperation: validate the exact original browser/outer-request or registered
 * client/callback/S256/bearer binding, plus known fence/generation. Quarantine
 * the same immutable flow and its descendants, even when the attempted write
 * failed before its operationId was recorded. Persist a locator-bound tombstone
 * under the transition lock; check it before a NEW operationId on that flow.
 * No delayed commit may become usable. A missing fence is safe only with the
 * never-reused ID and exact original admission proof; never infer a generation
 * or affect a newer flow. Do not release credentials, reset or reuse identities.
 * cancel: invalidate current transaction/descendants and advance its generation;
 * browser binding required. Future coordinated logout must additionally cancel
 * all outstanding records for its authoritative owner before revoking sessions.
 */
export interface CustomerSubjectBrokerRepository {
  register(input: Operation & { record: BrokerRegistrationRecord }): Promise<boolean>
  admit(input: BrowserOperation & { outerHash: string }): Promise<boolean>
  claimReadiness(input: BrowserOperation): Promise<BrokerReadinessClaim>
  finishReadiness(input: BrowserOperation & {
    fence: string; generation: string; codeHash: string; candidateSubject: string
    shopifyProof: BrokerShopifyProof; migrationProof: SupabaseSessionProof | null; hardDeadline: number
  }): Promise<boolean>
  redeemCode(input: Operation & {
    codeHash: string; clientId: string; redirectUri: string; challenge: string; bearerHash: string; bearerExpiresAt: number
  }): Promise<{ status: 'issued'; hardDeadline: number; bearerExpiresAt: number } | { status: 'rejected' }>
  consumeUserinfo(input: Operation & { bearerHash: string }): Promise<{ status: 'consumed'; sub: string; hardDeadline: number; bearerExpiresAt: number } | { status: 'rejected' }>
  holdOperation(input: Operation & { locator: BrokerLocator }): Promise<void>
  cancel(input: BrowserOperation): Promise<boolean>
}
export type BrokerPorts = {
  repository: CustomerSubjectBrokerRepository
  currentBrowser(): Promise<BrokerBrowserContext | null>
  serverRegistration(): Promise<BrokerServerRegistration | null>
  currentSession(): Promise<SupabaseSessionProof | null>
  verifiedShopifySubject(transactionId: string): Promise<BrokerShopifyProof | null>
  now(): number
}
type Action = { status: 'disabled' | 'held' | 'registered' | 'admitted' | 'authorization_ready' | 'cancelled'; liveEnabled: false; transactionId?: string; redirectUrl?: string }
export type BrokerProtocolResponse = { status: number; headers: Readonly<Record<string, string>>; body: Readonly<Record<string, string | number>>; liveEnabled: false }
const action = (status: Action['status']): Action => ({ status, liveEnabled: false })
const response = (status: number, body: Record<string, string | number>, authenticate?: string): BrokerProtocolResponse => ({ status,
  headers: Object.freeze({ 'content-type': 'application/json', 'cache-control': 'no-store', pragma: 'no-cache', ...(authenticate ? { 'www-authenticate': authenticate } : {}) }),
  body: Object.freeze(body), liveEnabled: false })
const error = (status: number, code: string, auth?: string) => response(status, { error: code }, auth)

function form(raw: unknown, max: number): URLSearchParams | null {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > max || /[\x00-\x20\x7f]/.test(raw) || /%(?![0-9a-f]{2})/i.test(raw)) return null
  const values = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw), keys = new Set<string>()
  for (const key of values.keys()) { if (keys.has(key)) return null; keys.add(key) }
  return values
}
function outerRequest(raw: string): BrokerOuterRequest | null {
  const q = form(raw, 4096)
  if (!q || q.get('response_type') !== 'code' || q.get('client_id') !== SUBJECT_BROKER_CLIENT_ID
    || q.get('redirect_uri') !== SUBJECT_BROKER_CALLBACK || q.get('scope') !== SUBJECT_BROKER_SCOPE
    || !uuid(q.get('state')) || q.get('code_challenge_method') !== 'S256' || !opaque(q.get('code_challenge'))) return null
  // Unrecognized OAuth parameters are ignored, never used as target/mode/proof.
  return { clientId: SUBJECT_BROKER_CLIENT_ID, redirectUri: SUBJECT_BROKER_CALLBACK, state: q.get('state')!,
    scope: 'subject', challenge: q.get('code_challenge')!, method: 'S256' }
}
function outerHash(o: BrokerOuterRequest) { return hash(JSON.stringify([o.clientId, o.redirectUri, o.state, o.scope, o.challenge, o.method])) }
function browserValid(b: BrokerBrowserContext | null): b is BrokerBrowserContext { return !!b && uuid(b.transactionId) && opaque(b.cookieSecret) }
function proofValid(p: SupabaseSessionProof | null, now: number): p is SupabaseSessionProof {
  return !!p && uuid(p.userId) && uuid(p.sessionId) && p.issuer === STAGING_SUPABASE_ISSUER && p.audience === 'authenticated'
    && p.anonymous === false && time(p.authenticatedAt) && p.authenticatedAt <= now && now - p.authenticatedAt < AUTH_MS
    && time(p.checkedAt) && p.checkedAt <= now && now - p.checkedAt < PROOF_MS && time(p.expiresAt) && p.expiresAt > now
}
function recordValid(r: BrokerRegistrationRecord, b: BrokerBrowserContext, now: number) {
  return r && r.id === b.transactionId && r.configHash === CONFIG_HASH && r.browserHash === hash(b.cookieSecret)
    && r.outer?.clientId === SUBJECT_BROKER_CLIENT_ID && r.outer.redirectUri === SUBJECT_BROKER_CALLBACK && uuid(r.outer.state)
    && r.outer.scope === 'subject' && r.outer.method === 'S256' && opaque(r.outer.challenge) && r.outerHash === outerHash(r.outer)
    && opaque(r.applicationPkceChallenge) && r.applicationPkceChallenge !== r.outer.challenge
    && ((r.mode === 'sign_in' && r.target === null) || (r.mode === 'migration' && r.target && uuid(r.target.userId) && uuid(r.target.sessionId)))
    && time(r.createdAt) && r.createdAt <= now && time(r.expiresAt) && r.expiresAt > now && r.expiresAt <= r.createdAt + ATTEMPT_MS
}
function basic(header: string, secret: string): boolean {
  try {
    const match = /^Basic ([A-Za-z0-9+/]+={0,2})$/i.exec(header)
    if (!match || Buffer.from(match[1], 'base64').toString('base64') !== match[1]) return false
    const encoded = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(match[1], 'base64')), colon = encoded.indexOf(':')
    if (colon < 1 || encoded.indexOf(':', colon + 1) !== -1) return false
    const decode = (s: string) => decodeURIComponent(s.replace(/\+/g, ' '))
    return safeEqual(decode(encoded.slice(0, colon)), SUBJECT_BROKER_CLIENT_ID) && safeEqual(decode(encoded.slice(colon + 1)), secret)
  } catch { return false }
}
function headers(raw: readonly (readonly [string, string])[]): Map<string, string> | null {
  if (!Array.isArray(raw)) return null
  const h = new Map<string, string>(); let size = 0
  for (const p of raw) {
    if (!Array.isArray(p) || p.length !== 2 || typeof p[0] !== 'string' || typeof p[1] !== 'string') return null
    const key = p[0].toLowerCase(); size += p[0].length + p[1].length
    if (size > 8192 || !/^[a-z0-9-]+$/.test(key) || /[\x00\r\n]/.test(p[1]) || h.has(key)) return null
    h.set(key, p[1])
  }
  return h
}

/** Only synthetic execution is available. Trusted ports must be private server
 * wiring, never derived from an incoming request's approval/mode/user fields. */
export function createCustomerSubjectBroker(input: { ports: BrokerPorts; clientSecret?: string; syntheticExecution?: boolean; liveEnabled?: boolean }) {
  const { ports, clientSecret } = input, repo = ports.repository
  const enabled = input.syntheticExecution === true && input.liveEnabled !== true && typeof clientSecret === 'string'
    && Buffer.byteLength(clientSecret) >= 32 && Buffer.byteLength(clientSecret) <= 512 && !/[\x00-\x1f\x7f]/.test(clientSecret)
  const active = () => enabled && typeof window === 'undefined'
  const op = (): Operation => ({ operationId: randomUUID(), configHash: CONFIG_HASH })
  const hold = async (operation: Operation, locator: BrokerLocator) => { try { await repo.holdOperation({ ...operation, locator }) } catch { /* No output or automatic retry. */ } }
  const browser = async () => { const b = await ports.currentBrowser(); return browserValid(b) ? structuredClone(b) : null }
  return Object.freeze({
    async register(): Promise<Action> {
      if (!active()) return action('disabled')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const registration = structuredClone(await ports.serverRegistration()), b = await browser(), now = ports.now()
        if (!registration || !b || !time(now)) return action('held')
        const outer = outerRequest(registration.authorizationQuery)
        if (!outer || registration.transactionId !== b.transactionId || !safeEqual(registration.cookieSecret, b.cookieSecret)
          || !opaque(registration.applicationPkceChallenge) || registration.applicationPkceChallenge === outer.challenge) return action('held')
        if (registration.mode === 'migration') {
          const p = await ports.currentSession()
          if (!proofValid(p, ports.now()) || !registration.target || !ownerEquals(registration.target, p)) return action('held')
        } else if (registration.mode !== 'sign_in' || registration.target !== null) return action('held')
        const record: BrokerRegistrationRecord = { id: b.transactionId, configHash: CONFIG_HASH, browserHash: hash(b.cookieSecret), outer, outerHash: outerHash(outer),
          applicationPkceChallenge: registration.applicationPkceChallenge, mode: registration.mode,
          target: registration.target ? { userId: registration.target.userId, sessionId: registration.target.sessionId } : null,
          createdAt: now, expiresAt: now + ATTEMPT_MS }
        locator = { kind: 'transaction', id: record.id, browserHash: record.browserHash, outerHash: record.outerHash }
        if (!await repo.register({ ...operation, record })) return action('held')
        return { ...action('registered'), transactionId: record.id }
      } catch { if (locator) await hold(operation, locator); return action('held') }
    },
    async admit(authorizationQuery: string): Promise<Action> {
      if (!active()) return action('disabled')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const outer = outerRequest(authorizationQuery), b = await browser()
        if (!outer || !b) return action('held')
        locator = { kind: 'transaction', id: b.transactionId, browserHash: hash(b.cookieSecret), outerHash: outerHash(outer) }
        if (!await repo.admit({ ...operation, transactionId: b.transactionId, browserHash: hash(b.cookieSecret), outerHash: outerHash(outer) })) return action('held')
        return { ...action('admitted'), transactionId: b.transactionId }
      } catch { if (locator) await hold(operation, locator); return action('held') }
    },
    async ready(): Promise<Action> {
      if (!active()) return action('disabled')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const b = await browser(), registration = structuredClone(await ports.serverRegistration())
        const outer = registration ? outerRequest(registration.authorizationQuery) : null
        if (!b || !registration || registration.transactionId !== b.transactionId || !safeEqual(registration.cookieSecret, b.cookieSecret) || !outer) return action('held')
        locator = { kind: 'transaction', id: b.transactionId, browserHash: hash(b.cookieSecret), outerHash: outerHash(outer) }
        const request = { ...operation, transactionId: b.transactionId, browserHash: hash(b.cookieSecret) }
        const claim = structuredClone(await repo.claimReadiness(request))
        if (claim.status !== 'claimed') return action('held')
        const r = claim.record
        if (!recordValid(r, b, ports.now()) || r.outerHash !== locator.outerHash || !text(claim.fence, 128) || !/^(0|[1-9]\d*)$/.test(claim.generation)) throw new Error('held')
        locator = { ...locator, fence: claim.fence, generation: claim.generation }
        const proof = structuredClone(await ports.verifiedShopifySubject(r.id)), p = r.mode === 'migration' ? structuredClone(await ports.currentSession()) : null, now = ports.now()
        if (!time(now) || !proof || proof.transactionId !== r.id || !uuid(proof.receiptId) || proof.shopId !== STAGING_SHOP_ID || proof.issuer !== STAGING_ISSUER
          || !text(proof.subject, 256) || !opaque(proof.innerPkceChallenge) || [r.outer.challenge, r.applicationPkceChallenge].includes(proof.innerPkceChallenge)
          || !time(proof.verifiedAt) || proof.verifiedAt > now || now - proof.verifiedAt >= PROOF_MS || !time(proof.expiresAt) || proof.expiresAt <= now
          || (r.mode === 'migration' && (!proofValid(p, now) || !r.target || !ownerEquals(r.target, p)))) throw new Error('held')
        const hardDeadline = Math.min(r.expiresAt, proof.verifiedAt + PROOF_MS, proof.expiresAt,
          ...(p ? [p.checkedAt + PROOF_MS, p.authenticatedAt + AUTH_MS, p.expiresAt] : []))
        const current = await browser()
        if (!current || current.transactionId !== b.transactionId || !safeEqual(current.cookieSecret, b.cookieSecret)) throw new Error('held')
        const code = random()
        const shopifyProof: BrokerShopifyProof = { transactionId: proof.transactionId, receiptId: proof.receiptId, shopId: proof.shopId, issuer: proof.issuer,
          subject: proof.subject, innerPkceChallenge: proof.innerPkceChallenge, verifiedAt: proof.verifiedAt, expiresAt: proof.expiresAt }
        const migrationProof: SupabaseSessionProof | null = p ? { userId: p.userId, sessionId: p.sessionId, issuer: p.issuer, audience: p.audience,
          anonymous: p.anonymous, authenticatedAt: p.authenticatedAt, checkedAt: p.checkedAt, expiresAt: p.expiresAt } : null
        if (!await repo.finishReadiness({ ...request, fence: claim.fence, generation: claim.generation, codeHash: hash(code), candidateSubject: `tllb_${random()}`,
          shopifyProof, migrationProof, hardDeadline })) throw new Error('held')
        const checkedAt = ports.now()
        if (!time(checkedAt) || checkedAt < now || checkedAt >= hardDeadline) throw new Error('held')
        const redirect = new URL(SUBJECT_BROKER_CALLBACK); redirect.searchParams.set('code', code); redirect.searchParams.set('state', r.outer.state)
        return { ...action('authorization_ready'), redirectUrl: redirect.href, transactionId: r.id }
      } catch { if (locator) await hold(operation, locator); return action('held') }
    },
    async token(request: { method: string; headers: readonly (readonly [string, string])[]; body: string }): Promise<BrokerProtocolResponse> {
      if (!active()) return error(503, 'temporarily_unavailable')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const h = headers(request.headers)
        if (request.method !== 'POST' || !h || !/^application\/x-www-form-urlencoded(?:\s*;\s*charset=utf-8)?$/i.test(h.get('content-type') ?? '')) return error(400, 'invalid_request')
        if (!basic(h.get('authorization') ?? '', clientSecret!)) return error(401, 'invalid_client', 'Basic realm="tll-staging-subject-broker"')
        const values = form(request.body, 4096)
        if (!values || values.has('client_secret') || values.has('client_id') || values.get('grant_type') !== 'authorization_code'
          || !opaque(values.get('code')) || values.get('redirect_uri') !== SUBJECT_BROKER_CALLBACK
          || !/^[A-Za-z0-9._~-]{43,128}$/.test(values.get('code_verifier') ?? '')) return error(400, 'invalid_request')
        const codeHash = hash(values.get('code')!), bearer = random(), now = ports.now()
        if (!time(now)) return error(503, 'temporarily_unavailable')
        const challenge = createHash('sha256').update(values.get('code_verifier')!).digest('base64url')
        locator = { kind: 'code', hash: codeHash, clientId: SUBJECT_BROKER_CLIENT_ID, redirectUri: SUBJECT_BROKER_CALLBACK, challenge }
        const bearerExpiresAt = now + BEARER_MS
        const result = await repo.redeemCode({ ...operation, codeHash, clientId: SUBJECT_BROKER_CLIENT_ID, redirectUri: SUBJECT_BROKER_CALLBACK,
          challenge, bearerHash: hash(bearer), bearerExpiresAt })
        if (result.status !== 'issued') return error(400, 'invalid_grant')
        const checkedAt = ports.now()
        if (!time(checkedAt) || checkedAt < now || !time(result.hardDeadline) || result.hardDeadline > now + PROOF_MS
          || result.hardDeadline <= checkedAt || result.bearerExpiresAt !== bearerExpiresAt || bearerExpiresAt - checkedAt <= 10_000) throw new Error('held')
        return response(200, { access_token: bearer, token_type: 'Bearer', expires_in: Math.floor((bearerExpiresAt - checkedAt) / 1000), scope: SUBJECT_BROKER_SCOPE })
      } catch { if (locator) await hold(operation, locator); return error(503, 'temporarily_unavailable') }
    },
    async userinfo(request: { method: string; headers: readonly (readonly [string, string])[] }): Promise<BrokerProtocolResponse> {
      if (!active()) return error(503, 'temporarily_unavailable')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const h = headers(request.headers), match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(h?.get('authorization') ?? '')
        if (request.method !== 'GET' || !h || !match || !opaque(match[1])) return error(401, 'invalid_token', 'Bearer')
        const bearerHash = hash(match[1]); locator = { kind: 'bearer', hash: bearerHash }
        const result = await repo.consumeUserinfo({ ...operation, bearerHash })
        if (result.status !== 'consumed') return error(401, 'invalid_token', 'Bearer')
        const now = ports.now()
        if (!time(now) || !brokerSubject(result.sub) || !time(result.hardDeadline) || result.hardDeadline <= now || result.hardDeadline > now + PROOF_MS
          || !time(result.bearerExpiresAt) || result.bearerExpiresAt <= now) throw new Error('held')
        return response(200, { sub: result.sub })
      } catch { if (locator) await hold(operation, locator); return error(503, 'temporarily_unavailable') }
    },
    async cancel(): Promise<Action> {
      if (!active()) return action('disabled')
      const operation = op(); let locator: BrokerLocator | null = null
      try {
        const b = await browser(), registration = structuredClone(await ports.serverRegistration())
        const outer = registration ? outerRequest(registration.authorizationQuery) : null
        if (!b || !registration || registration.transactionId !== b.transactionId || !safeEqual(registration.cookieSecret, b.cookieSecret) || !outer) return action('held')
        locator = { kind: 'transaction', id: b.transactionId, browserHash: hash(b.cookieSecret), outerHash: outerHash(outer) }
        return action(await repo.cancel({ ...operation, transactionId: b.transactionId, browserHash: hash(b.cookieSecret) }) ? 'cancelled' : 'held')
      } catch { if (locator) await hold(operation, locator); return action('held') }
    },
  })
}
