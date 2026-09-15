// TEMPORARY F21 acceptance instrumentation. Remove before production release.
// See docs/ops/staging-ip-proof.md. No database, account, email or logging calls.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { isHostedStaging } from '@/lib/preview-mode'
import { vercelClientIdentity } from '@/lib/submissions/gateway'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const responseHeaders = {
  'Cache-Control': 'private, no-store, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Vercel-CDN-Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
}
const hexKey = /^[0-9a-f]{64}$/
const runId = /^[0-9a-f]{32}$/
// RFC 5737 / RFC 3849 documentation addresses used by the proof client only.
const documentationSpoofs = new Set(['192.0.2.1', '198.51.100.2', '203.0.113.3', '[2001:db8::4]'])

function notFound(): Response {
  return new Response(null, { status: 404, headers: responseHeaders })
}

export function GET(request: Request): Response {
  // VERCEL_ENV is server-side and prevents a public marker accidentally opening
  // a production deployment. Synthetic previews remain disabled independently.
  if (!isHostedStaging() || process.env.VERCEL !== '1' || process.env.VERCEL_ENV !== 'preview'
    || process.env.TLL_IP_PROOF_ENABLED !== 'true') return notFound()
  const key = process.env.TLL_IP_PROOF_KEY_HEX ?? ''
  const expectedRun = process.env.TLL_IP_PROOF_RUN_ID ?? ''
  const expires = process.env.TLL_IP_PROOF_EXPIRES_AT ?? ''
  const now = Date.now()
  // Short-lived configuration also closes older immutable deployments after
  // their environment snapshot is no longer editable. Maximum active window 1h.
  if (!hexKey.test(key) || !runId.test(expectedRun) || !/^[1-9][0-9]{12}$/.test(expires)
    || Number(expires) <= now || Number(expires) - now > 60 * 60 * 1000) return notFound()
  const suppliedKey = request.headers.get('x-tll-ip-proof-key') ?? ''
  if (!hexKey.test(suppliedKey)
    || !timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(suppliedKey, 'hex'))
    || request.headers.get('x-tll-ip-proof-run') !== expectedRun) return notFound()

  // Reuse the exact F21 production identity function, never a diagnostic parser.
  const identity = vercelClientIdentity(request, {
    vercel: process.env.VERCEL, vercelEnvironment: process.env.VERCEL_ENV,
  })
  return Response.json({
    matches_documentation_spoof: identity !== null && documentationSpoofs.has(identity),
    fingerprint: identity === null ? null : createHmac('sha256', Buffer.from(key, 'hex'))
      .update(`tll-ip-proof:v1\n${expectedRun}\n${identity}`, 'utf8').digest('hex'),
  }, { headers: responseHeaders })
}

// No implicit HEAD/OPTIONS behaviour and no mutation or alternative method.
export const HEAD = notFound
export const OPTIONS = notFound
export const POST = notFound
export const PUT = notFound
export const PATCH = notFound
export const DELETE = notFound
