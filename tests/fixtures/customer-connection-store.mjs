// Synthetic ONLY. Atomic synchronous Map transitions model the required port
// contract; these are not SQL, encryption, crash durability or hosted acceptance.
import { randomUUID } from 'node:crypto'
const copy = value => structuredClone(value)
const ownerKey = (userId, shopId) => `${userId}:${shopId}`
const subjectKey = b => JSON.stringify([b.shopId, b.issuer, b.subject])
export function syntheticConnectionStore() {
  const attempts = new Map(), connections = new Map(), subjects = new Map(), owners = new Map(), generations = new Map()
  let sequence = 0
  const fence = () => String(++sequence)
  const generation = (user, shop) => generations.get(ownerKey(user, shop)) ?? 0
  const attemptById = id => [...attempts.values()].find(a => a.id === id)
  return {
    attempts, connections,
    async createAttempt(a) {
      if (attempts.has(a.stateHash) || [...attempts.values()].some(r => r.owner.userId === a.owner.userId && r.shopId === a.shopId
        && ['pending', 'exchanging'].includes(r.status) && r.expiresAt > a.createdAt)) return false
      attempts.set(a.stateHash, { ...copy(a), status: 'pending', generation: generation(a.owner.userId, a.shopId), fence: fence() })
      return true
    },
    async claimAttempt(stateHash, owner, configHash, now) {
      const a = attempts.get(stateHash)
      if (!a || a.status !== 'pending' || a.owner.userId !== owner.userId || a.owner.sessionId !== owner.sessionId
        || a.configHash !== configHash || a.expiresAt <= now || a.generation !== generation(owner.userId, a.shopId)) return { status: 'rejected' }
      a.status = 'exchanging'; a.fence = fence()
      return { status: 'claimed', attempt: copy(a), fence: a.fence }
    },
    async finishAttempt(id, expectedFence, binding, tokens, now) {
      const a = attemptById(id)
      if (!a || a.status !== 'exchanging' || a.fence !== expectedFence || a.expiresAt <= now
        || a.generation !== generation(a.owner.userId, a.shopId) || binding.userId !== a.owner.userId || binding.shopId !== a.shopId) return { status: 'rejected' }
      const existingSubject = connections.get(subjects.get(subjectKey(binding))), existingOwner = connections.get(owners.get(ownerKey(binding.userId, binding.shopId)))
      if ((existingSubject && existingSubject.binding.userId !== binding.userId)
        || (existingOwner && subjectKey(existingOwner.binding) !== subjectKey(binding))
        || existingOwner?.status === 'refreshing') return { status: 'rejected' }
      const connectionId = existingOwner?.id ?? randomUUID(), c = { id: connectionId, binding: copy(binding), tokens: copy(tokens), status: 'active', fence: fence(), configHash: a.configHash }
      connections.set(connectionId, c); subjects.set(subjectKey(binding), connectionId); owners.set(ownerKey(binding.userId, binding.shopId), connectionId)
      a.status = 'connected'; a.connectionId = connectionId; a.connectionFence = c.fence
      return { status: 'connected', connectionId }
    },
    async holdAttempt(id, expectedFence) {
      const a = attemptById(id); if (!a || a.fence !== expectedFence) return
      a.status = 'held'
      const c = connections.get(a.connectionId)
      if (c?.fence === a.connectionFence) c.status = 'held'
    },
    async claimRefresh(id, owner, configHash, now, leaseMs) {
      const c = connections.get(id)
      if (!c || c.binding.userId !== owner.userId || c.configHash !== configHash) return { status: 'rejected' }
      if (c.status === 'refreshing' && c.leaseExpiresAt <= now) c.status = 'held'
      if (c.status !== 'active' || [...attempts.values()].some(a => a.owner.userId === owner.userId && ['pending', 'exchanging'].includes(a.status) && a.expiresAt > now)) return { status: 'rejected' }
      c.status = 'refreshing'; c.fence = fence(); c.leaseExpiresAt = now + leaseMs
      return { status: 'claimed', connectionId: id, fence: c.fence, binding: copy(c.binding), tokens: copy(c.tokens), configHash, leaseExpiresAt: c.leaseExpiresAt }
    },
    async finishRefresh(id, expectedFence, tokens, now) {
      const c = connections.get(id)
      if (!c || c.status !== 'refreshing' || c.fence !== expectedFence || c.leaseExpiresAt <= now) return false
      c.tokens = copy(tokens); c.status = 'active'; return true
    },
    async holdRefresh(id, expectedFence) {
      const c = connections.get(id); if (c?.fence === expectedFence && c.status !== 'logged_out') c.status = 'held'
    },
    async beginLogout(owner, shopId) {
      generations.set(ownerKey(owner.userId, shopId), generation(owner.userId, shopId) + 1)
      for (const a of attempts.values()) if (a.owner.userId === owner.userId && a.shopId === shopId) { a.status = 'held'; a.fence = fence() }
      const c = connections.get(owners.get(ownerKey(owner.userId, shopId)))
      if (c) { c.status = 'logged_out'; c.fence = fence(); c.logoutIdToken = c.tokens?.idToken ?? c.logoutIdToken; delete c.tokens }
      return { status: 'local_revoked', upstreamLogout: c ? 'pending' : 'not_required' }
    },
  }
}
