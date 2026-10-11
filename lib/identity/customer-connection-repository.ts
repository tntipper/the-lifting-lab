// Server-only, unmounted adapter. Never install with a browser/service-role client.
import type { CustomerConnectionRepository, ConnectAttempt, AttemptClaim, RefreshClaim, Owner, SubjectBinding, VaultTokens } from './customer-connection.ts'
import type { EnvelopeVault } from './customer-token-vault.ts'

/** Compatible with a dedicated pg Pool. connect must return an exclusively leased,
 * idle client; release(true) discards uncertain/broken sessions. The adapter owns
 * BEGIN/COMMIT. No transaction-bound or browser PostgREST client is accepted. */
export type CustomerRepositoryPool = {
  connect(): Promise<{
    query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>
    release(destroy?: boolean): void
  }>
}
type Row = Record<string, unknown>
type ClaimContext = { kind: 'attempt' | 'refresh'; id: string; fence: string }
const SHOP = '107532616020', ISSUER = `https://shopify.com/authentication/${SHOP}`
const PROJECT = 'qdmvngjwkcsilzmqksme'
const unavailable = () => new Error('Customer repository unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const fence = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,18}$/.test(v) && BigInt(v) <= BigInt('9223372036854775807')
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= 253402300799999
const text = (v: unknown, max = 32768): v is string => typeof v === 'string' && v.length > 0 && v.length <= max && !/[\x00-\x20\x7f]/.test(v)
const record = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
function owner(value: Owner) { ensure(value && uuid(value.userId) && uuid(value.sessionId)) }
function binding(value: SubjectBinding) { ensure(value && uuid(value.userId) && value.shopId === SHOP && value.issuer === ISSUER && text(value.subject, 256)) }
function claimContext(value: unknown): ClaimContext {
  ensure(record(value) && (value.kind === 'attempt' || value.kind === 'refresh') && uuid(value.id) && fence(value.fence))
  return { kind: value.kind, id: value.id, fence: value.fence }
}
function attempt(value: ConnectAttempt) {
  ensure(value && uuid(value.id) && sha(value.stateHash) && sha(value.configHash) && value.shopId === SHOP)
  owner(value.owner)
  ensure(/^https:\/\/[a-z0-9-]+\.vercel\.app\/auth\/shopify\/callback$/.test(value.callbackUrl)
    && ms(value.createdAt) && ms(value.expiresAt) && value.expiresAt > value.createdAt && value.expiresAt - value.createdAt <= 300000
    && /^[A-Za-z0-9_-]{43}$/.test(value.verifier) && /^[A-Za-z0-9_-]{43}$/.test(value.nonce))
}
function tokens(value: VaultTokens) {
  ensure(value && text(value.accessToken) && text(value.refreshToken) && text(value.idToken) && ms(value.accessExpiresAt)
    && /^[A-Za-z0-9_-]{43}$/.test(value.originalNonce) && Array.isArray(value.scopes)
    && [...value.scopes].sort().join(' ') === 'customer-account-api:full email openid')
  const scope = value.scopeProvenance, refresh = value.refreshTokenProvenance
  ensure(scope === null || (record(scope) && ['token_response', 'unchanged_request'].includes(scope.source)
    && scope.requestedScope === 'openid email customer-account-api:full' && ['authorization_code','refresh_token'].includes(scope.grantType)))
  ensure(refresh === null || (record(refresh) && ((refresh.source === 'token_response' && ['authorization_code','refresh_token'].includes(refresh.grantType))
    || (refresh.source === 'retained_original' && refresh.grantType === 'refresh_token' && sha(refresh.previousTokenHash)))))
}
function attemptAAD(a: ConnectAttempt): string[] {
  return ['tll-customer-connection/v1',PROJECT,'connect-attempt',a.id,a.stateHash,a.owner.userId,a.owner.sessionId,a.shopId,a.configHash,a.callbackUrl,String(a.createdAt),String(a.expiresAt)]
}
function tokenAAD(b: SubjectBinding, configHash: string, context: ClaimContext, purpose = 'token-bundle'): string[] {
  binding(b); ensure(sha(configHash)); const c = claimContext(context)
  return ['tll-customer-connection/v1',PROJECT,purpose,b.shopId,b.issuer,b.subject,b.userId,configHash,c.kind,c.id,c.fence]
}
/** The two independent gates default disabled: this adapter and the SQL control
 * row. syntheticExecution is for isolated fixtures, not production activation.
 * The caller must inject a reviewed executor connection and external server keyring.
 */
export function createCustomerConnectionRepository(input: { pool: CustomerRepositoryPool; vault: EnvelopeVault; syntheticExecution?: boolean; liveEnabled?: boolean }): CustomerConnectionRepository & { liveEnabled: false } {
  const enabled = input.syntheticExecution === true && input.liveEnabled !== true
  async function call(op: string, payload: object): Promise<Row> {
    ensure(enabled)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined, result: Row | undefined, failed = false
    try {
      client = await input.pool.connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      const response = await client.query('SELECT tll_customer_private.repository($1::text, $2::jsonb) AS result', [op, JSON.stringify(payload)])
      ensure(response.rows.length === 1 && record(response.rows[0].result)); result = response.rows[0].result
      await client.query('COMMIT')
    } catch {
      failed = true
      try { await client?.query('ROLLBACK') } catch { /* discard even if rollback acknowledgement fails */ }
    } finally { client?.release(failed) }
    if (failed || !result) {
      // A lost COMMIT acknowledgement may leave a durable claim. Quarantine the
      // known same fence, after releasing the first connection. Never retry claim.
      if (result?.status === 'claimed' && fence(result.fence)) {
        const id = op === 'claim_attempt' ? result.id : result.connectionId
        if (uuid(id) && (op === 'claim_attempt' || op === 'claim_refresh')) {
          try { await call(op === 'claim_attempt' ? 'hold_attempt' : 'hold_refresh', { id, fence: result.fence }) } catch { /* SQL exchanging/lease remains unreclaimable */ }
        }
      }
      if (op === 'finish_attempt' || op === 'finish_refresh') {
        const p = payload as { id?: unknown; fence?: unknown }
        if (uuid(p.id) && fence(p.fence)) try {
          await call(op === 'finish_attempt' ? 'hold_attempt' : 'hold_refresh',{id:p.id,fence:p.fence})
        } catch { /* same-fence hold remains required on recovery */ }
      }
      throw unavailable()
    }
    return result
  }
  async function hold(op: 'hold_attempt' | 'hold_refresh', id: string, expectedFence: string) {
    ensure(uuid(id) && fence(expectedFence)); if (!enabled) return
    await call(op,{id,fence:expectedFence})
  }
  return Object.freeze({
    liveEnabled: false as const,
    async createAttempt(value: ConnectAttempt): Promise<boolean> {
      if (!enabled) return false
      const a = structuredClone(value); attempt(a)
      const material = input.vault.seal(a,attemptAAD(a))
      const r = await call('create_attempt',{id:a.id,stateHash:a.stateHash,userId:a.owner.userId,sessionId:a.owner.sessionId,
        shopId:a.shopId,configHash:a.configHash,callbackUrl:a.callbackUrl,createdAt:a.createdAt,expiresAt:a.expiresAt,material})
      return r.status === 'created'
    },
    async claimAttempt(stateHash: string, owned: Owner, configHash: string, _now: number): Promise<AttemptClaim> {
      void _now // DB clock is authoritative; retained only for port compatibility.
      if (!enabled) return {status:'rejected'}
      owner(owned); ensure(sha(stateHash) && sha(configHash))
      const r = await call('claim_attempt',{stateHash,userId:owned.userId,sessionId:owned.sessionId,configHash})
      if (r.status !== 'claimed') return {status:'rejected'}
      try {
        ensure(uuid(r.id) && fence(r.fence) && r.userId === owned.userId && r.sessionId === owned.sessionId
          && r.stateHash === stateHash && r.configHash === configHash && r.shopId === SHOP && typeof r.callbackUrl === 'string' && ms(r.createdAt) && ms(r.expiresAt))
        const metadata = {id:r.id,stateHash,owner:{...owned},configHash,shopId:SHOP,callbackUrl:r.callbackUrl,createdAt:r.createdAt,expiresAt:r.expiresAt}
        const a = input.vault.open<ConnectAttempt>(r.material,attemptAAD({...metadata,nonce:'',verifier:''})); attempt(a)
        for (const key of ['id','stateHash','configHash','shopId','callbackUrl','createdAt','expiresAt'] as const) ensure(a[key] === metadata[key])
        ensure(a.owner.userId === owned.userId && a.owner.sessionId === owned.sessionId)
        return {status:'claimed',attempt:a,fence:r.fence}
      } catch {
        if (uuid(r.id) && fence(r.fence)) try { await hold('hold_attempt',r.id,r.fence) } catch { /* unreclaimable exchanging state */ }
        throw unavailable()
      }
    },
    async finishAttempt(id: string, expectedFence: string, bound: SubjectBinding, value: VaultTokens, _now: number) {
      void _now
      if (!enabled) return {status:'rejected'} as const
      ensure(uuid(id) && fence(expectedFence)); binding(bound); tokens(value)
      const b = structuredClone(bound), t = structuredClone(value), context = {kind:'attempt',id,fence:expectedFence} as const
      const r = await call('attempt_context',{id,fence:expectedFence})
      if (r.status !== 'ready' || r.userId !== b.userId || r.shopId !== b.shopId || !sha(r.configHash)) return {status:'rejected'} as const
      const done = await call('finish_attempt',{id,fence:expectedFence,binding:b,accessExpiresAt:t.accessExpiresAt,
        tokens:input.vault.seal(t,tokenAAD(b,r.configHash,context)),
        logout:input.vault.seal({idToken:t.idToken},tokenAAD(b,r.configHash,context,'logout-intent'))})
      if (done.status !== 'connected') return {status:'rejected'} as const
      ensure(uuid(done.connectionId)); return {status:'connected',connectionId:done.connectionId} as const
    },
    holdAttempt: (id: string, expectedFence: string) => hold('hold_attempt',id,expectedFence),
    async claimRefresh(id: string, owned: Owner, configHash: string, _now: number, leaseMs: number): Promise<RefreshClaim> {
      void _now
      if (!enabled) return {status:'rejected'}
      owner(owned); ensure(uuid(id) && sha(configHash) && Number.isSafeInteger(leaseMs) && leaseMs >= 1 && leaseMs <= 60000)
      const r = await call('claim_refresh',{id,userId:owned.userId,sessionId:owned.sessionId,configHash,leaseMs})
      if (r.status !== 'claimed') return {status:'rejected'}
      try {
        ensure(r.connectionId === id && fence(r.fence) && r.configHash === configHash && ms(r.leaseExpiresAt) && record(r.binding))
        const b = r.binding as SubjectBinding; binding(b); ensure(b.userId === owned.userId)
        const t = input.vault.open<VaultTokens>(r.tokens,tokenAAD(b,configHash,claimContext(r.tokenContext))); tokens(t)
        return {status:'claimed',connectionId:id,fence:r.fence,binding:b,configHash,tokens:t,leaseExpiresAt:r.leaseExpiresAt}
      } catch {
        if (fence(r.fence)) try { await hold('hold_refresh',id,r.fence) } catch { /* lease expiry can only hold */ }
        throw unavailable()
      }
    },
    async finishRefresh(id: string, expectedFence: string, value: VaultTokens, _now: number): Promise<boolean> {
      void _now
      if (!enabled) return false
      ensure(uuid(id) && fence(expectedFence)); tokens(value); const t = structuredClone(value)
      const r = await call('refresh_context',{id,fence:expectedFence})
      if (r.status !== 'ready') return false
      ensure(record(r.binding) && sha(r.configHash)); const b = r.binding as SubjectBinding; binding(b)
      const context = {kind:'refresh',id,fence:expectedFence} as const
      const done = await call('finish_refresh',{id,fence:expectedFence,accessExpiresAt:t.accessExpiresAt,
        tokens:input.vault.seal(t,tokenAAD(b,r.configHash,context)),
        logout:input.vault.seal({idToken:t.idToken},tokenAAD(b,r.configHash,context,'logout-intent'))})
      return done.status === 'refreshed'
    },
    holdRefresh: (id: string, expectedFence: string) => hold('hold_refresh',id,expectedFence),
    async beginLogout(owned: Owner, shopId: string, _now: number) {
      void _now
      ensure(enabled); owner(owned); ensure(shopId === SHOP)
      const r = await call('logout',{userId:owned.userId,sessionId:owned.sessionId,shopId})
      ensure(r.status === 'local_revoked' && (r.upstreamLogout === 'pending' || r.upstreamLogout === 'not_required'))
      return {status:'local_revoked',upstreamLogout:r.upstreamLogout} as const
    },
  })
}
