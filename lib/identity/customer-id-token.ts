import { createLocalJWKSet, jwtVerify, type JSONWebKeySet } from 'jose'
import { STAGING_ISSUER, type IdVerification, type VerifiedId } from './customer-connection'

/** Offline verifier only. A future trusted loader must fetch this snapshot from
 * the pinned JWKS URL with TLS/redirect/size controls and accountable freshness.
 * This function never follows jku/x5u, fetches keys, or trusts a browser JWKS.
 * No actual Shopify keys or claims have been accepted by this foundation.
 */
export function createLocalCustomerIdVerifier(snapshot: {
  sourceUrl: string; verifiedAt: number; expiresAt: number; jwks: JSONWebKeySet
}): (token: string, expected: IdVerification) => Promise<VerifiedId | null> {
  let keys: ReturnType<typeof createLocalJWKSet> | null = null
  const sourceUrl = snapshot?.sourceUrl, verifiedAt = snapshot?.verifiedAt, expiresAt = snapshot?.expiresAt
  try {
    const jwks = structuredClone(snapshot.jwks)
    if (sourceUrl !== `${STAGING_ISSUER}/.well-known/jwks.json` || !Number.isSafeInteger(verifiedAt) || !Number.isSafeInteger(expiresAt)
      || verifiedAt <= 0 || expiresAt <= verifiedAt || expiresAt - verifiedAt > 86_400_000
      || !Array.isArray(jwks.keys) || jwks.keys.length === 0 || jwks.keys.length > 20
      || jwks.keys.some(k => k.kty !== 'RSA' || (k.alg !== undefined && k.alg !== 'RS256') || (k.use !== undefined && k.use !== 'sig')
        || typeof k.kid !== 'string' || !k.kid || typeof k.n !== 'string' || typeof k.e !== 'string'
        || ['d', 'p', 'q', 'dp', 'dq', 'qi', 'oth', 'k'].some(p => p in k))
      || new Set(jwks.keys.map(k => k.kid)).size !== jwks.keys.length) throw new Error('invalid public key snapshot')
    keys = createLocalJWKSet(jwks)
  } catch { /* Missing/untrusted keys always fail closed. */ }
  return async (token, expected) => {
    try {
      if (!keys || typeof token !== 'string' || token.length > 32_768 || expected.issuer !== STAGING_ISSUER
        || expected.jwksUri !== sourceUrl || !Number.isSafeInteger(expected.now) || expected.now < verifiedAt || expected.now >= expiresAt) return null
      const { payload, protectedHeader } = await jwtVerify(token, keys, {
        algorithms: ['RS256'], issuer: STAGING_ISSUER, audience: expected.audience,
        currentDate: new Date(expected.now), clockTolerance: 0, requiredClaims: ['iss', 'sub', 'aud', 'iat', 'exp'],
      })
      const audiences = typeof payload.aud === 'string' ? [payload.aud] : payload.aud
      // One intended client only. Additional audiences/azp need separate review.
      if (protectedHeader.jku || protectedHeader.x5u || !Array.isArray(audiences) || audiences.length !== 1 || audiences[0] !== expected.audience
        || typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 256 || /[\x00-\x20\x7f]/.test(payload.sub)
        || !Number.isSafeInteger(payload.iat) || !Number.isSafeInteger(payload.exp)
        || payload.iat! * 1000 > expected.now || payload.exp! <= payload.iat!
        || !(payload.nonce === expected.nonce || (payload.nonce === undefined && (expected.nonceOptional === true || expected.nonce === null)))) return null
      // No email, metadata or caller approval participates in the binding.
      return { issuer: STAGING_ISSUER, subject: payload.sub, audience: audiences[0], nonce: typeof payload.nonce === 'string' ? payload.nonce : null,
        issuedAt: payload.iat! * 1000, expiresAt: payload.exp! * 1000 }
    } catch { return null }
  }
}
