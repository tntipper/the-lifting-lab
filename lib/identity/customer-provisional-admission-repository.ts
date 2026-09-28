// Unmounted Node/server admission intent store. No provider/network work at import.
import { createHash } from 'node:crypto'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'
import type { SupabaseSessionProof } from './customer-connection'
import type { BrokerOuterRequest } from './customer-subject-broker'

const VERSION = 'tll-provisional-admission/1', PROJECT = 'qdmvngjwkcsilzmqksme'
const PROVIDER = 'custom:tll-staging-subject-broker-v1', CLIENT = 'tll-staging-subject-broker-v1'
const ISSUER = `https://${PROJECT}.supabase.co/auth/v1`, CALLBACK = `${ISSUER}/callback`, PATH = '/auth/customer/authorize'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const unavailable = () => new Error('Provisional admission repository unavailable')
const ensure: (v: unknown) => asserts v = v => { if (!v) throw unavailable() }
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v)
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= 253402300799999
const integer = (v: unknown, zero = false): v is string => typeof v === 'string' && (zero ? /^(0|[1-9][0-9]{0,18})$/ : /^[1-9][0-9]{0,18}$/).test(v) && BigInt(v) <= BigInt('9223372036854775807')
const originValid = (v: unknown): v is string => typeof v === 'string' && v.length <= 253
  && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(v) && new URL(v).origin === v
const config = (origin: string) => hash([VERSION, origin, PROJECT, PROVIDER, CLIENT, CALLBACK, 'subject'])
export type ProvisionalOriginalOwner = { userId: string; sessionId: string; accessTokenHash: string }
export type ProvisionalAdmissionMetadata = {
  transactionId: string; browserHash: string; configHash: string; intentHash: string; applicationOrigin: string
  mode: 'sign_in' | 'migration'; original: ProvisionalOriginalOwner | null
  applicationPkceChallenge: string; createdAt: number; expiresAt: number
}
export type ProvisionalAdmissionBinding = Pick<ProvisionalAdmissionMetadata, 'transactionId' | 'browserHash' | 'configHash' | 'intentHash' | 'applicationPkceChallenge'>
type Operation = ProvisionalAdmissionBinding & { operationId: string }
/** Supplied only by the actual reviewed session verifier and token-hash capture.
 * Its metadata is NOT evidence that this repository verified a live session. */
export type ProvisionalMigrationProof = SupabaseSessionProof & { accessTokenHash: string }
export type ProvisionalAdmissionSnapshot = ProvisionalAdmissionBinding & {
  state: 'prepared' | 'admission_inflight' | 'admitted' | 'held' | 'cancelled'
  metadata: ProvisionalAdmissionMetadata | null; fence: string; generation: string; observedAt: number
  outer: BrokerOuterRequest | null; outerHash: string | null
}
export interface CustomerProvisionalAdmissionRepository {
  readonly liveEnabled: false
  readonly configHash: string
  prepare(input: { operationId: string; metadata: ProvisionalAdmissionMetadata; applicationPkceVerifier: string }): Promise<boolean>
  claimAdmission(input: Operation & { currentMigrationProof: ProvisionalMigrationProof | null }): Promise<{ status: 'claimed'; snapshot: ProvisionalAdmissionSnapshot } | { status: 'rejected' }>
  finishAdmission(input: Operation & { fence: string; generation: string; admission: { authorizationUrl: string; authorizationQuery: string } }): Promise<boolean>
  readIntent(input: ProvisionalAdmissionBinding): Promise<ProvisionalAdmissionSnapshot | null>
  holdOperation(input: Operation & { fence?: string; generation?: string }): Promise<void>
  cancel(input: Operation): Promise<boolean>
}
/** Pure metadata construction BEFORE prepare, so a lost prepare acknowledgement
 * still leaves the caller with the exact original quarantine binding. No UUID,
 * browser secret, verifier, credential, proof or time is generated here. */
export function createProvisionalAdmissionMetadata(input: Omit<ProvisionalAdmissionMetadata, 'configHash' | 'intentHash'>): ProvisionalAdmissionMetadata {
  const r = input
  ensure(r && originValid(r.applicationOrigin) && uuid(r.transactionId) && sha(r.browserHash) && opaque(r.applicationPkceChallenge)
    && ms(r.createdAt) && ms(r.expiresAt) && r.expiresAt > r.createdAt && r.expiresAt - r.createdAt <= 300000)
  ensure((r.mode === 'sign_in' && r.original === null) || (r.mode === 'migration' && r.original && uuid(r.original.userId) && uuid(r.original.sessionId) && sha(r.original.accessTokenHash)))
  const original = r.original ? { userId: r.original.userId, sessionId: r.original.sessionId, accessTokenHash: r.original.accessTokenHash } : null
  const configHash = config(r.applicationOrigin)
  const intentHash = hash([r.transactionId,r.browserHash,configHash,r.applicationOrigin,r.mode,
    original ? [original.userId,original.sessionId,original.accessTokenHash] : null,r.applicationPkceChallenge,r.createdAt,r.expiresAt])
  return { transactionId: r.transactionId, browserHash: r.browserHash, configHash, intentHash, applicationOrigin: r.applicationOrigin,
    mode: r.mode, original, applicationPkceChallenge: r.applicationPkceChallenge, createdAt: r.createdAt, expiresAt: r.expiresAt }
}
function outerValid(o: BrokerOuterRequest, applicationChallenge: string): BrokerOuterRequest {
  ensure(o && o.clientId === CLIENT && o.redirectUri === CALLBACK && uuid(o.state) && o.scope === 'subject'
    && o.method === 'S256' && opaque(o.challenge) && o.challenge !== applicationChallenge)
  return { clientId: CLIENT, redirectUri: CALLBACK, state: o.state, scope: 'subject', challenge: o.challenge, method: 'S256' }
}
const outerHash = (o: BrokerOuterRequest) => hash([o.clientId,o.redirectUri,o.state,o.scope,o.challenge,o.method])
function admission(value: { authorizationUrl: string; authorizationQuery: string }, origin: string, challenge: string) {
  ensure(value && typeof value.authorizationQuery === 'string' && value.authorizationQuery.length <= 4096
    && typeof value.authorizationUrl === 'string' && value.authorizationUrl === `${origin}${PATH}?${value.authorizationQuery}`)
  const q = new URLSearchParams(value.authorizationQuery)
  const o = outerValid({ clientId: q.get('client_id')!, redirectUri: q.get('redirect_uri')!, state: q.get('state')!,
    scope: q.get('scope') as 'subject', challenge: q.get('code_challenge')!, method: q.get('code_challenge_method') as 'S256' },challenge)
  // Accept exactly the canonical output of the reviewed admission transport.
  // No browser URL, duplicate, extension, malformed encoding or raw error remains.
  const normalized = new URLSearchParams({ response_type: 'code', client_id: CLIENT, redirect_uri: CALLBACK,
    scope: 'subject', state: o.state, code_challenge_method: 'S256', code_challenge: o.challenge }).toString()
  ensure(value.authorizationQuery === normalized)
  return { outer: o, outerHash: outerHash(o) }
}
/** Dedicated bounded idle-client pool and independent injected keyring only.
 * All returns acknowledge COMMIT; uncertainty throws without any automatic retry.
 * Caller must hold the original binding before recovery. This API cannot dispatch
 * HTTP, register007, decrypt PKCE, release browser cookies or promote an identity. */
export function createCustomerProvisionalAdmissionRepository(input: {
  pool: CustomerRepositoryPool; vault: EnvelopeVault; applicationOrigin: string; syntheticExecution?: boolean; liveEnabled?: boolean
}): CustomerProvisionalAdmissionRepository {
  const origin = input.applicationOrigin; ensure(originValid(origin))
  const configHash = config(origin), pool = input.pool, vault = input.vault
  const enabled = input.syntheticExecution === true && input.liveEnabled !== true
  const active = () => enabled && typeof window === 'undefined'
  function binding(p: ProvisionalAdmissionBinding): ProvisionalAdmissionBinding {
    ensure(p && p.configHash === configHash && uuid(p.transactionId) && sha(p.browserHash) && sha(p.intentHash) && opaque(p.applicationPkceChallenge))
    return { transactionId: p.transactionId, browserHash: p.browserHash, configHash, intentHash: p.intentHash, applicationPkceChallenge: p.applicationPkceChallenge }
  }
  function operation(p: Operation): Operation { const b = binding(p); ensure(uuid(p.operationId)); return { ...b, operationId: p.operationId } }
  function metadata(p: ProvisionalAdmissionMetadata) {
    const r = createProvisionalAdmissionMetadata(p)
    ensure(r.applicationOrigin === origin && r.configHash === p.configHash && r.intentHash === p.intentHash)
    return r
  }
  async function call(op: string, payload: object): Promise<Record<string, unknown>> {
    ensure(active()); const wire = JSON.stringify(payload); ensure(Buffer.byteLength(wire) <= 16384)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined, result: Record<string, unknown> | undefined, failed = false
    try {
      client = await pool.connect(); await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'"); await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const response = await client.query('SELECT tll_provisional_private.repository($1::text, $2::jsonb) AS result',[op,wire])
      ensure(response.rows.length === 1 && object(response.rows[0].result)); result = response.rows[0].result
      const expected: Record<string, string> = { prepare:'prepared',claim_admission:'claimed',finish_admission:'admitted',read_intent:'found',hold:'held',cancel:'cancelled' }
      ensure(result.status === 'rejected' || result.status === expected[op]); await client.query('COMMIT')
    } catch { failed = true; try { await client?.query('ROLLBACK') } catch { /* discard uncertainty */ } }
    finally { try { client?.release(failed) } catch { failed = true } }
    if (failed || !result) throw unavailable(); return result
  }
  function snapshot(value: unknown, b: ProvisionalAdmissionBinding): ProvisionalAdmissionSnapshot {
    ensure(object(value)); const s = value as ProvisionalAdmissionSnapshot
    ensure(['prepared','admission_inflight','admitted','held','cancelled'].includes(s.state) && integer(s.fence) && integer(s.generation,true) && ms(s.observedAt))
    const actual = binding(s); ensure(Object.keys(b).every(k => b[k as keyof typeof b] === actual[k as keyof typeof b]))
    const m = s.metadata === null ? null : metadata(s.metadata)
    ensure(m === null || Object.keys(b).every(k => b[k as keyof typeof b] === m[k as keyof typeof b]))
    const o = s.outer === null ? null : outerValid(s.outer,b.applicationPkceChallenge)
    ensure((o === null && s.outerHash === null) || (o && s.outerHash === outerHash(o)))
    ensure((m !== null || s.state === 'held') && (s.state !== 'admitted' || o !== null)
      && (!['prepared','admission_inflight'].includes(s.state) || o === null))
    return { ...actual,state:s.state,metadata:m,fence:s.fence,generation:s.generation,observedAt:s.observedAt,outer:o,outerHash:s.outerHash }
  }
  return Object.freeze({
    liveEnabled:false as const,configHash,
    async prepare(p) {
      if (!active()) return false
      const m = metadata(p.metadata); ensure(uuid(p.operationId) && opaque(p.applicationPkceVerifier)
        && createHash('sha256').update(p.applicationPkceVerifier).digest('base64url') === m.applicationPkceChallenge)
      let material
      try { material = vault.seal({ verifier:p.applicationPkceVerifier },['tll-provisional-admission/v1',PROJECT,'application-pkce',m.transactionId,m.configHash,m.browserHash,m.intentHash,'0']) }
      catch { throw unavailable() }
      return (await call('prepare',{...operation({...m,operationId:p.operationId}),metadata:m,material})).status === 'prepared'
    },
    async claimAdmission(p) {
      if (!active()) return {status:'rejected'}
      const b = operation(p), proof = p.currentMigrationProof
      ensure(proof === null || (proof && uuid(proof.userId) && uuid(proof.sessionId) && sha(proof.accessTokenHash)
        && proof.issuer === ISSUER && proof.audience === 'authenticated' && proof.anonymous === false
        && ms(proof.checkedAt) && ms(proof.authenticatedAt) && ms(proof.expiresAt)))
      const r = await call('claim_admission',{...b,currentMigrationProof:proof ? {userId:proof.userId,sessionId:proof.sessionId,
        accessTokenHash:proof.accessTokenHash,issuer:proof.issuer,audience:proof.audience,anonymous:false,
        checkedAt:proof.checkedAt,authenticatedAt:proof.authenticatedAt,expiresAt:proof.expiresAt} : null})
      if(r.status !== 'claimed') return {status:'rejected'}
      const s = snapshot(r.snapshot,binding(b)); ensure(s.state === 'admission_inflight' && s.metadata !== null)
      return {status:'claimed',snapshot:s}
    },
    async finishAdmission(p) {
      if (!active()) return false
      const b = operation(p); ensure(integer(p.fence) && integer(p.generation,true))
      return (await call('finish_admission',{...b,fence:p.fence,generation:p.generation,...admission(p.admission,origin,b.applicationPkceChallenge)})).status === 'admitted'
    },
    async readIntent(p) {
      if (!active()) return null
      const b = binding(p),r = await call('read_intent',b)
      return r.status === 'found' ? snapshot(r.snapshot,b) : null
    },
    async holdOperation(p) {
      ensure(active()); const b = operation(p)
      ensure((p.fence === undefined || integer(p.fence)) && (p.generation === undefined || integer(p.generation,true)))
      ensure((await call('hold',{...b,...(p.fence === undefined ? {} : {fence:p.fence}),...(p.generation === undefined ? {} : {generation:p.generation})})).status === 'held')
    },
    async cancel(p) { if (!active()) return false; return (await call('cancel',operation(p))).status === 'cancelled' },
  } satisfies CustomerProvisionalAdmissionRepository)
}
