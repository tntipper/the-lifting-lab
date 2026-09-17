// Atomic synchronous Map model ONLY. Not durable SQL, a gateway or encryption.
// Never use this outside tests. It intentionally exposes state for assertions.
import { createHash } from 'node:crypto'
const hash = s => createHash('sha256').update(s).digest('hex')
const copy = v => structuredClone(v)
export function syntheticBrokerStore(now) {
  const records = new Map(), states = new Map(), codes = new Map(), bearers = new Map(), subjects = new Map(), heldOperations = new Set(), ownerGenerations = new Map(), quarantines = new Map()
  let sequence = 0
  const fence = () => String(++sequence)
  const currentOwnerGeneration = r => ownerGenerations.get(r.target?.userId) ?? 0
  const valid = (r, i) => r && r.configHash === i.configHash && r.expiresAt > now() && r.createdAt <= now()
    && r.ownerGeneration === currentOwnerGeneration(r) && !['held', 'cancelled', 'consumed'].includes(r.status) && !heldOperations.has(i.operationId)
  const owned = (r, i) => valid(r, i) && r.browserHash === i.browserHash
  const mark = (r, i) => { r.operations.add(i.operationId); r.fence = fence(); r.fences.add(r.fence) }
  const ready = (r, i) => valid(r, i) && r.hardDeadline > now() && r.readyGeneration === r.generation
  const store = {
    records, codes, bearers, subjects, heldOperations,
    async register(i) {
      const r = i.record
      if (heldOperations.has(i.operationId) || quarantines.has(r.id) || records.has(r.id) || states.has(r.outer.state) || r.configHash !== i.configHash
        || r.expiresAt <= now() || r.createdAt > now() || r.expiresAt > r.createdAt + 300000) return false
      const row = { ...copy(r), status: 'registered', generation: '0', fence: fence(), ownerGeneration: currentOwnerGeneration(r), operations: new Set([i.operationId]), fences: new Set() }
      row.fences.add(row.fence)
      records.set(r.id, row); states.set(r.outer.state, r.id); return true
    },
    async admit(i) {
      const r = records.get(i.transactionId)
      if (!owned(r, i) || r.status !== 'registered' || r.outerHash !== i.outerHash) return false
      mark(r, i); r.status = 'admitted'; return true
    },
    async claimReadiness(i) {
      const r = records.get(i.transactionId)
      if (!owned(r, i) || r.status !== 'admitted') return { status: 'rejected' }
      mark(r, i); r.status = 'verifying'
      const record = copy(r)
      for (const key of ['operations', 'status', 'generation', 'fence', 'fences', 'ownerGeneration']) delete record[key]
      return { status: 'claimed', record, fence: r.fence, generation: r.generation }
    },
    async finishReadiness(i) {
      const r = records.get(i.transactionId), p = i.shopifyProof, m = i.migrationProof
      if (!owned(r, i) || r.status !== 'verifying' || r.fence !== i.fence || r.generation !== i.generation || !r.operations.has(i.operationId)
        || i.hardDeadline <= now() || i.hardDeadline > Math.min(r.expiresAt, p.verifiedAt + 5000, p.expiresAt)
        || (r.mode === 'migration' && (!m || m.userId !== r.target.userId || m.sessionId !== r.target.sessionId
          || i.hardDeadline > Math.min(m.checkedAt + 5000, m.authenticatedAt + 300000, m.expiresAt)))
        || (r.mode === 'sign_in' && m !== null) || codes.has(i.codeHash)) return false
      const key = JSON.stringify([p.shopId, p.issuer, p.subject]), existing = subjects.get(key)
      // This model's sign-in allocation is deliberately provisional. Tests may
      // inspect it but no auth UUID is invented or marked linked.
      if (r.mode === 'sign_in' && existing && !existing.provisional) return false
      if (r.mode === 'migration' && existing && (existing.provisional || (existing.targetUserId && existing.targetUserId !== r.target.userId))) return false
      const subject = existing ?? { sub: i.candidateSubject, provisional: r.mode === 'sign_in', targetUserId: r.target?.userId ?? null, boundUserId: null }
      subjects.set(key, subject)
      mark(r, i); r.status = 'ready'; r.sub = subject.sub; r.hardDeadline = i.hardDeadline; r.readyGeneration = r.generation
      r.shopifyProof = copy(p); r.migrationProof = copy(m); r.codeHash = i.codeHash
      codes.set(i.codeHash, r.id); return true
    },
    async redeemCode(i) {
      const r = records.get(codes.get(i.codeHash))
      if (!ready(r, i) || r.outer.clientId !== i.clientId || r.outer.redirectUri !== i.redirectUri || r.outer.challenge !== i.challenge) return { status: 'rejected' }
      if (r.status === 'token_issued') { r.status = 'held'; r.fence = fence(); return { status: 'rejected' } }
      if (r.status !== 'ready' || bearers.has(i.bearerHash) || i.bearerExpiresAt <= now() || i.bearerExpiresAt > now() + 60000) return { status: 'rejected' }
      mark(r, i); r.status = 'token_issued'; r.bearerHash = i.bearerHash; r.bearerExpiresAt = i.bearerExpiresAt
      bearers.set(i.bearerHash, r.id)
      return { status: 'issued', hardDeadline: r.hardDeadline, bearerExpiresAt: r.bearerExpiresAt }
    },
    async consumeUserinfo(i) {
      const r = records.get(bearers.get(i.bearerHash))
      if (!ready(r, i) || r.status !== 'token_issued' || r.bearerExpiresAt <= now()) return { status: 'rejected' }
      mark(r, i); r.status = 'consumed'
      return { status: 'consumed', sub: r.sub, hardDeadline: r.hardDeadline, bearerExpiresAt: r.bearerExpiresAt }
    },
    async holdOperation(i) {
      heldOperations.add(i.operationId)
      const l = i.locator
      const id = l.kind === 'transaction' ? l.id : (l.kind === 'code' ? codes : bearers).get(l.hash)
      const r = records.get(id)
      if (!r && l.kind === 'transaction' && /^[a-f0-9]{64}$/.test(l.browserHash) && /^[a-f0-9]{64}$/.test(l.outerHash)
        && l.fence === undefined && l.generation === undefined) { quarantines.set(id, copy(i)); return }
      if (!r || r.configHash !== i.configHash || r.status === 'cancelled') return
      const authorized = l.kind === 'transaction' ? l.browserHash === r.browserHash && l.outerHash === r.outerHash
        && (l.generation === undefined || l.generation === r.generation) && (l.fence === undefined || r.fences.has(l.fence))
        : l.kind === 'code' ? l.clientId === r.outer.clientId && l.redirectUri === r.outer.redirectUri && l.challenge === r.outer.challenge
          : r.bearerHash === l.hash
      if (authorized) { quarantines.set(id, copy(i)); r.status = 'held'; r.fence = fence() }
    },
    async cancel(i) {
      const r = records.get(i.transactionId)
      if (!r || r.configHash !== i.configHash || r.browserHash !== i.browserHash || heldOperations.has(i.operationId)) return false
      mark(r, i); r.status = 'cancelled'; r.generation = String(Number(r.generation) + 1); return true
    },
    // Test-only model for the future coordinated logout gateway; no method
    // allowing a public caller to pick an owner exists in the protocol core.
    cancelOwner(userId) { ownerGenerations.set(userId, (ownerGenerations.get(userId) ?? 0) + 1) },
    // An unrelated delayed hold cannot target the current transaction by locator alone.
    browserHash: b => hash(b.cookieSecret),
  }
  return store
}
