// Node/server-only, unmounted durable adapter. No network work at import.
import { createHash } from 'node:crypto'
import type { CustomerRepositoryPool } from './customer-connection-repository.ts'
import type { BrokerRegistrationRecord, CustomerSubjectBrokerRepository, BrokerLocator } from './customer-subject-broker.ts'

type Row = Record<string, unknown>
type Input<M extends keyof CustomerSubjectBrokerRepository> = Parameters<CustomerSubjectBrokerRepository[M]>[0]
/** releaseHash is supplied only by trusted server extraction/derivation. Omit it
 * for standalone 007; installed 010 requires it and rejects the old path. */
export type CustomerSubjectBrokerDurableRepository = Omit<CustomerSubjectBrokerRepository, 'admit'> & {
  liveEnabled: false; admit(input: Input<'admit'> & { releaseHash?: string }): Promise<boolean>
}
const CONFIG = '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'
const CLIENT = 'tll-staging-subject-broker-v1', CALLBACK = 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback'
const unavailable = () => new Error('Subject broker repository unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw unavailable() }
const row = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v)
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v)
const sha = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v)
const integer = (v: unknown, zero = false): v is string => typeof v === 'string' && (zero ? /^(0|[1-9][0-9]{0,18})$/ : /^[1-9][0-9]{0,18}$/).test(v) && BigInt(v) <= BigInt('9223372036854775807')
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) <= 253402300799999
function operation(p: { operationId: string; configHash: string }) {
  ensure(p && uuid(p.operationId) && p.configHash === CONFIG)
  return { operationId: p.operationId, configHash: CONFIG }
}
function browser(p: Input<'cancel'>) {
  const common = operation(p); ensure(uuid(p.transactionId) && sha(p.browserHash))
  return { ...common, transactionId: p.transactionId, browserHash: p.browserHash }
}
function registration(r: BrokerRegistrationRecord): BrokerRegistrationRecord {
  ensure(r && uuid(r.id) && r.configHash === CONFIG && sha(r.browserHash) && sha(r.outerHash) && r.outer)
  const o = r.outer
  ensure(o.clientId === CLIENT && o.redirectUri === CALLBACK && uuid(o.state) && o.scope === 'subject' && o.method === 'S256'
    && opaque(o.challenge) && opaque(r.applicationPkceChallenge) && o.challenge !== r.applicationPkceChallenge)
  ensure(createHash('sha256').update(JSON.stringify([o.clientId,o.redirectUri,o.state,o.scope,o.challenge,o.method])).digest('hex') === r.outerHash)
  ensure((r.mode === 'sign_in' && r.target === null) || (r.mode === 'migration' && r.target && uuid(r.target.userId) && uuid(r.target.sessionId)))
  ensure(ms(r.createdAt) && ms(r.expiresAt) && r.expiresAt > r.createdAt && r.expiresAt - r.createdAt <= 300000)
  // Explicit projection keeps arbitrary token-bearing caller extras out of SQL.
  return { id: r.id, configHash: CONFIG, browserHash: r.browserHash, outerHash: r.outerHash,
    outer: { clientId: CLIENT, redirectUri: CALLBACK, state: o.state, scope: 'subject', challenge: o.challenge, method: 'S256' },
    applicationPkceChallenge: r.applicationPkceChallenge, mode: r.mode,
    target: r.target ? { userId: r.target.userId, sessionId: r.target.sessionId } : null, createdAt: r.createdAt, expiresAt: r.expiresAt }
}
function locator(l: BrokerLocator): BrokerLocator {
  ensure(l)
  if (l.kind === 'transaction') {
    ensure(uuid(l.id) && sha(l.browserHash) && sha(l.outerHash) && (l.fence === undefined || integer(l.fence)) && (l.generation === undefined || integer(l.generation,true)))
    return { kind: l.kind, id: l.id, browserHash: l.browserHash, outerHash: l.outerHash,
      ...(l.fence === undefined ? {} : { fence: l.fence }), ...(l.generation === undefined ? {} : { generation: l.generation }) }
  }
  ensure((l.kind === 'code' || l.kind === 'bearer') && sha(l.hash))
  if (l.kind === 'bearer') return { kind: l.kind, hash: l.hash }
  ensure(l.clientId === CLIENT && l.redirectUri === CALLBACK && opaque(l.challenge))
  return { kind: l.kind, hash: l.hash, clientId: CLIENT, redirectUri: CALLBACK, challenge: l.challenge }
}

/** The injected pool must exclusively lease idle clients with bounded connect,
 * acquisition and query deadlines. This adapter owns BEGIN/COMMIT and discards
 * failed sessions. Every success is an acknowledged commit; an unknown result
 * throws without retry. The protocol core then calls holdOperation using its
 * original immutable locator, including when no operation row was committed.
 * No hosted pool, runtime LOGIN, provider or route is provisioned here. */
export function createCustomerSubjectBrokerRepository(input: {
  pool: CustomerRepositoryPool; syntheticExecution?: boolean; liveEnabled?: boolean
}): CustomerSubjectBrokerDurableRepository {
  const pool = input.pool, enabled = input.syntheticExecution === true && input.liveEnabled !== true
  const active = () => enabled && typeof window === 'undefined'
  async function call(op: string, payload: object): Promise<Row> {
    ensure(active())
    const wire = JSON.stringify(payload); ensure(Buffer.byteLength(wire) <= 16384)
    let client: Awaited<ReturnType<CustomerRepositoryPool['connect']>> | undefined, result: Row | undefined, failed = false
    try {
      client = await pool.connect()
      await client.query('BEGIN')
      await client.query("SET LOCAL lock_timeout = '5s'")
      await client.query("SET LOCAL statement_timeout = '10s'")
      await client.query("SET LOCAL idle_in_transaction_session_timeout = '15s'")
      const response = await client.query('SELECT tll_broker_private.repository($1::text, $2::jsonb) AS result', [op, wire])
      ensure(response.rows.length === 1 && row(response.rows[0].result)); result = response.rows[0].result
      const success: Record<string, string> = { register: 'registered', admit: 'admitted', claim_readiness: 'claimed',
        finish_readiness: 'ready', redeem_code: 'issued', consume_userinfo: 'consumed', hold: 'held', cancel: 'cancelled' }
      ensure(result.status === 'rejected' || result.status === success[op])
      await client.query('COMMIT')
    } catch {
      failed = true
      try { await client?.query('ROLLBACK') } catch { /* uncertain connections are discarded */ }
    } finally {
      try { client?.release(failed) } catch { failed = true }
    }
    if (failed || !result) throw unavailable()
    return result
  }
  return Object.freeze({
    liveEnabled: false as const,
    async register(p) {
      if (!active()) return false
      return (await call('register',{ ...operation(p), record: registration(p.record) })).status === 'registered'
    },
    async admit(p) {
      if (!active()) return false
      const base = browser(p); ensure(sha(p.outerHash))
      const hasRelease = Object.hasOwn(p, 'releaseHash')
      if (hasRelease) ensure(sha(p.releaseHash))
      return (await call('admit',{ ...base, outerHash: p.outerHash, ...(hasRelease ? { releaseHash: p.releaseHash } : {}) })).status === 'admitted'
    },
    async claimReadiness(p) {
      if (!active()) return { status: 'rejected' }
      const base = browser(p), r = await call('claim_readiness',base)
      if (r.status !== 'claimed') return { status: 'rejected' }
      ensure(row(r.record) && integer(r.fence) && integer(r.generation,true))
      const record = registration(r.record as BrokerRegistrationRecord)
      ensure(record.id === base.transactionId && record.browserHash === base.browserHash)
      return { status: 'claimed', record, fence: r.fence, generation: r.generation }
    },
    async finishReadiness(p) {
      if (!active()) return false
      const base = browser(p), proof = p.shopifyProof, migration = p.migrationProof
      ensure(integer(p.fence) && integer(p.generation,true) && sha(p.codeHash) && typeof p.candidateSubject === 'string'
        && p.candidateSubject.startsWith('tllb_') && opaque(p.candidateSubject.slice(5)) && ms(p.hardDeadline))
      ensure(proof && proof.transactionId === p.transactionId && uuid(proof.receiptId) && proof.shopId === '107532616020'
        && proof.issuer === 'https://shopify.com/authentication/107532616020' && typeof proof.subject === 'string'
        && proof.subject.length > 0 && proof.subject.length <= 256 && !/[\x00-\x20\x7f]/.test(proof.subject)
        && opaque(proof.innerPkceChallenge) && ms(proof.verifiedAt) && ms(proof.expiresAt))
      ensure(migration === null || (migration && uuid(migration.userId) && uuid(migration.sessionId)
        && migration.issuer === 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1' && migration.audience === 'authenticated'
        && migration.anonymous === false && ms(migration.authenticatedAt) && ms(migration.checkedAt) && ms(migration.expiresAt)))
      return (await call('finish_readiness',{ ...base, fence: p.fence, generation: p.generation, codeHash: p.codeHash,
        candidateSubject: p.candidateSubject, hardDeadline: p.hardDeadline,
        shopifyProof: { transactionId: proof.transactionId, receiptId: proof.receiptId, shopId: proof.shopId, issuer: proof.issuer,
          subject: proof.subject, innerPkceChallenge: proof.innerPkceChallenge, verifiedAt: proof.verifiedAt, expiresAt: proof.expiresAt },
        migrationProof: migration ? { userId: migration.userId, sessionId: migration.sessionId, issuer: migration.issuer, audience: migration.audience,
          anonymous: migration.anonymous, authenticatedAt: migration.authenticatedAt, checkedAt: migration.checkedAt, expiresAt: migration.expiresAt } : null })).status === 'ready'
    },
    async redeemCode(p) {
      if (!active()) return { status: 'rejected' }
      const base = operation(p)
      ensure(sha(p.codeHash) && p.clientId === CLIENT && p.redirectUri === CALLBACK && opaque(p.challenge) && sha(p.bearerHash) && ms(p.bearerExpiresAt))
      const bearerExpiresAt = p.bearerExpiresAt
      const r = await call('redeem_code',{ ...base, codeHash: p.codeHash, clientId: CLIENT, redirectUri: CALLBACK,
        challenge: p.challenge, bearerHash: p.bearerHash, bearerExpiresAt })
      if (r.status !== 'issued') return { status: 'rejected' }
      ensure(ms(r.hardDeadline) && ms(r.bearerExpiresAt) && r.bearerExpiresAt === bearerExpiresAt)
      return { status: 'issued', hardDeadline: r.hardDeadline, bearerExpiresAt: r.bearerExpiresAt }
    },
    async consumeUserinfo(p) {
      if (!active()) return { status: 'rejected' }
      const base = operation(p); ensure(sha(p.bearerHash))
      const r = await call('consume_userinfo',{ ...base, bearerHash: p.bearerHash })
      if (r.status !== 'consumed') return { status: 'rejected' }
      ensure(typeof r.sub === 'string' && r.sub.startsWith('tllb_') && opaque(r.sub.slice(5)) && ms(r.hardDeadline) && ms(r.bearerExpiresAt))
      return { status: 'consumed', sub: r.sub, hardDeadline: r.hardDeadline, bearerExpiresAt: r.bearerExpiresAt }
    },
    async holdOperation(p) {
      ensure(active())
      ensure((await call('hold',{ ...operation(p), locator: locator(p.locator) })).status === 'held')
    },
    async cancel(p) {
      if (!active()) return false
      return (await call('cancel',browser(p))).status === 'cancelled'
    },
  } satisfies CustomerSubjectBrokerDurableRepository)
}
