// Final browser persistence only. The session must already have passed durable
// reconciliation and the exact release reread before this module is called.
import type { CustomerFinalRelease } from '@/lib/identity/customer-final-reconciliation'
import { STAGING_POSTGRES_PROJECT_REF } from './staging-postgres'

const STORAGE = `sb-${STAGING_POSTGRES_PROJECT_REF}-auth-token`
const TRANSACTION_COOKIES = ['__Host-tll-customer-start', '__Host-tll-customer-transaction'] as const
const CHUNK = 3180, MAX_CHUNKS = 3, COOKIE_AGE = 400 * 24 * 60 * 60
const ISSUER = `https://${STAGING_POSTGRES_PROJECT_REF}.supabase.co/auth/v1`
const uuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
const safe = (value: unknown, max: number): value is string => typeof value === 'string' && value.length >= 16
  && value.length <= max && !/[\x00-\x1f\x7f]/.test(value)
const fail = () => new Error('Staging customer session release unavailable')
const ensure: (value: unknown) => asserts value = value => { if (!value) throw fail() }

function jwtPayload(token: string) {
  const parts = token.split('.'); ensure(parts.length === 3 && parts.every(part => /^[A-Za-z0-9_-]+$/.test(part)))
  const bytes = Buffer.from(parts[1], 'base64url'); ensure(bytes.length > 1 && bytes.length <= 8192 && bytes.toString('base64url') === parts[1])
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  ensure(value && typeof value === 'object' && !Array.isArray(value)); return value as Record<string, unknown>
}

function setCookie(response: Response, name: string, value: string, attributes: string) {
  response.headers.append('set-cookie', `${name}=${value}; Path=/; Secure; SameSite=Lax; ${attributes}`)
}

/** Build the only successful final-callback response. No provider/user object,
 * email, metadata, proof, broker subject or database evidence enters storage. */
export function stagingCustomerSessionResponse(release: CustomerFinalRelease, now = Date.now()): Response {
  try {
    ensure(Number.isSafeInteger(now) && now > 0 && release?.status === 'reconciled'
      && uuid(release.transactionId) && /^[a-f0-9]{64}$/.test(release.callbackHash)
      && uuid(release.userId) && uuid(release.identityId)
      && typeof release.reservedSubject === 'string'
      && /^tllb_[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(release.reservedSubject))
    const session = release.session
    ensure(session?.tokenType === 'Bearer' && safe(session.accessToken, 16_384) && safe(session.refreshToken, 16_384)
      && Number.isSafeInteger(session.expiresAt) && session.expiresAt > now)
    const claims = jwtPayload(session.accessToken)
    ensure(claims.sub === release.userId && claims.iss === ISSUER && claims.aud === 'authenticated'
      && Number.isSafeInteger(claims.exp) && (claims.exp as number) * 1000 === session.expiresAt)
    const value = 'base64-' + Buffer.from(JSON.stringify({ access_token: session.accessToken,
      refresh_token: session.refreshToken, token_type: 'bearer', expires_at: claims.exp,
      expires_in: Math.max(1, Math.floor((session.expiresAt - now) / 1000)) })).toString('base64url')
    ensure(value.length <= CHUNK * MAX_CHUNKS)
    const chunks = value.length <= CHUNK ? [{ name: STORAGE, value }]
      : Array.from({ length: Math.ceil(value.length / CHUNK) }, (_, index) => ({
        name: `${STORAGE}.${index}`, value: value.slice(index * CHUNK, (index + 1) * CHUNK),
      }))
    ensure(chunks.length <= MAX_CHUNKS)
    const response = new Response(null, { status: 303, headers: { location: '/dashboard',
      'cache-control': 'no-store, private', pragma: 'no-cache', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', vary: 'Cookie' } })
    const expired = 'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT'
    for (const name of TRANSACTION_COOKIES) setCookie(response, name, '', `HttpOnly; ${expired}`)
    setCookie(response, STORAGE, '', expired)
    for (let index = 0; index < 12; index++) setCookie(response, `${STORAGE}.${index}`, '', expired)
    for (const chunk of chunks) setCookie(response, chunk.name, chunk.value, `Max-Age=${COOKIE_AGE}`)
    return response
  } catch { throw fail() }
}
