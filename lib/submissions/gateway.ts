import { createHash, createHmac } from 'node:crypto'
import { isIP } from 'node:net'

export const SUBMISSION_LIMITS = Object.freeze({ bodyBytes: 16384, name: 120, email: 254, message: 8000, brand: 120, product: 200, url: 2048, notes: 4000 })
export const SUBMISSION_CATEGORIES = Object.freeze(['whey', 'whey-isolate', 'casein', 'creatine', 'pre-workout', 'eaas', 'intra-workout', 'post-workout', 'hydration', 'cycle-support', 'protein-bar', 'meal-replacement', 'vitamin', 'multivitamin', 'vitamin-d', 'zma', 'hormone-support', 'gut-digestion', 'heart-health', 'liver-health', 'omega-3', 'joint-health', 'vitamin-c', 'magnesium', 'sleep-recovery'])
export type SubmissionKind = 'contact' | 'supplement'
export type SubmissionBody = Record<string, string>
export type GatewayConfig = {
  enabled: boolean; vercel: string | undefined; vercelEnvironment: string | undefined
  allowedOrigins: string[]; audience: string; keyId: string; signingKeyHex: string; privacyKeyHex: string
  supabaseUrl: string; anonKey: string
}
export type SignedSubmission = { p_key_id: string; p_payload: string; p_signature: string }
type GatewayReply = { status: 'accepted' | 'duplicate' | 'rate_limited' | 'conflict' | 'invalid' | 'rejected' | 'unavailable'; retry_after_seconds?: number }
export type GatewayDependencies = { now: () => number; transport: (signed: SignedSubmission) => Promise<GatewayReply>; identity: (request: Request) => string | null }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const hexKey = /^[0-9a-f]{64}$/
const emailPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const mac = (key: string, value: string) => createHmac('sha256', Buffer.from(key, 'hex')).update(value, 'utf8').digest('hex')

function stringField(value: unknown, maximum: number, required: boolean, multiline = false): string | null {
  if (value === undefined && !required) return ''
  if (typeof value !== 'string') return null
  const clean = value.trim()
  if ((required && clean.length === 0) || clean.length > maximum || /[\uD800-\uDFFF]/u.test(clean)) return null
  if ((multiline ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(clean)) return null
  return clean
}

export function validateSubmission(kind: SubmissionKind, raw: unknown): SubmissionBody | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const input = raw as Record<string, unknown>
  const names = kind === 'contact' ? ['name', 'email', 'message'] : ['category', 'brand', 'product', 'url', 'notes', 'email']
  if (Object.keys(input).some(key => !names.includes(key))) return null
  const result: SubmissionBody = {}
  for (const key of names) {
    const maximum = key === 'category' ? 40 : SUBMISSION_LIMITS[key as keyof typeof SUBMISSION_LIMITS]
    const required = kind === 'contact' || !['notes', 'email'].includes(key)
    const value = stringField(input[key], maximum, required, key === 'message' || key === 'notes')
    if (value === null) return null
    result[key] = value
  }
  if (result.email && !emailPattern.test(result.email)) return null
  if (kind === 'supplement') {
    if (!SUBMISSION_CATEGORIES.includes(result.category)) return null
    try {
      const url = new URL(result.url)
      if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.includes('#') || !url.hostname.includes('.') || url.hostname.endsWith('.local') || isIP(url.hostname.replace(/^\[|\]$/g, ''))) return null
      // URLs are evidence only and are never fetched by this gateway.
      if (url.href.length > SUBMISSION_LIMITS.url) return null
      result.url = url.href
    } catch { return null }
  }
  return result
}

/** Only the Vercel-controlled header is considered, and only in a Vercel runtime. */
export function vercelClientIdentity(request: Request, config: Pick<GatewayConfig, 'vercel' | 'vercelEnvironment'>): string | null {
  if (config.vercel !== '1' || !['production', 'preview'].includes(config.vercelEnvironment ?? '')) return null
  const ip = request.headers.get('x-vercel-forwarded-for')
  if (!ip || ip !== ip.trim() || !isIP(ip)) return null
  // Canonical representation prevents alternative IPv6 spellings changing quota subjects.
  return isIP(ip) === 6 ? new URL('http://[' + ip + ']/').hostname.toLowerCase() : ip
}

function configured(config: GatewayConfig): boolean {
  if (!config.enabled || !hexKey.test(config.signingKeyHex) || !hexKey.test(config.privacyKeyHex) || config.signingKeyHex === config.privacyKeyHex) return false
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.keyId) || !/^tll-submissions:[a-z0-9_-]{1,64}$/.test(config.audience)) return false
  if (config.allowedOrigins.length === 0 || config.allowedOrigins.some(origin => { try { return new URL(origin).origin !== origin || !origin.startsWith('https://') } catch { return true } })) return false
  return true
}

export function signSubmission(kind: SubmissionKind, body: SubmissionBody, requestId: string, identity: string, config: GatewayConfig, nowMs: number): SignedSubmission {
  const bodyJson = JSON.stringify(body)
  // The exact serialized payload is signed and transmitted unchanged. PostgreSQL verifies
  // its original UTF-8 bytes before parsing; there is no cross-runtime JSON canonicalizer.
  const payload = JSON.stringify({
    version: 1, audience: config.audience, kind, issued_at: Math.floor(nowMs / 1000), request_id: requestId,
    ip_subject: mac(config.privacyKeyHex, 'ip\n' + identity),
    email_subject: body.email ? mac(config.privacyKeyHex, 'email\n' + body.email.toLowerCase()) : '',
    body_sha256: sha(bodyJson), body_json: bodyJson,
  })
  return { p_key_id: config.keyId, p_payload: payload, p_signature: mac(config.signingKeyHex, payload) }
}

function respond(status: number, error?: string, retryAfter?: number): Response {
  return Response.json(error ? { error } : { ok: true }, { status, headers: { 'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}) } })
}

async function boundedJson(request: Request): Promise<{ value?: unknown; status?: number }> {
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')) return { status: 415 }
  if (request.headers.has('content-encoding') && request.headers.get('content-encoding') !== 'identity') return { status: 415 }
  const declared = request.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > SUBMISSION_LIMITS.bodyBytes)) return { status: 413 }
  if (!request.body) return { status: 400 }
  const reader = request.body.getReader(), chunks: Uint8Array[] = []
  let length = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      length += value.byteLength
      if (length > SUBMISSION_LIMITS.bodyBytes) { await reader.cancel(); return { status: 413 } }
      chunks.push(value)
    }
    return { value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))) }
  } catch { return { status: 400 } }
  finally { reader.releaseLock() }
}

/** Dependency injection is a code-level test seam; production never accepts a fixture identity. */
export function createSubmissionHandler(config: GatewayConfig, dependencies: GatewayDependencies) {
  return async (request: Request, kind: SubmissionKind): Promise<Response> => {
    if (request.method !== 'POST') return respond(405, 'Method not allowed.')
    if (!configured(config)) return respond(503, 'Submissions are temporarily unavailable.')
    const origin = request.headers.get('origin')
    if (!origin || !config.allowedOrigins.includes(origin)) return respond(403, 'This request could not be accepted.')
    const identity = dependencies.identity(request)
    if (!identity) return respond(503, 'Submissions are temporarily unavailable.')
    const requestId = request.headers.get('idempotency-key') ?? ''
    if (!uuid.test(requestId)) return respond(400, 'Please refresh the form and try again.')
    const parsed = await boundedJson(request)
    if (parsed.status) return respond(parsed.status, parsed.status === 413 ? 'Your submission is too large.' : 'Invalid submission format.')
    const body = validateSubmission(kind, parsed.value)
    if (!body) return respond(400, 'Please check the form fields and try again.')
    const now = dependencies.now()
    if (!Number.isSafeInteger(now) || now < 0) return respond(503, 'Submissions are temporarily unavailable.')
    try {
      const result = await dependencies.transport(signSubmission(kind, body, requestId, identity, config, now))
      if (result.status === 'accepted' || result.status === 'duplicate') return respond(202)
      if (result.status === 'rate_limited') {
        const retry = Number.isSafeInteger(result.retry_after_seconds) && result.retry_after_seconds! > 0 && result.retry_after_seconds! <= 86400 ? result.retry_after_seconds! : 60
        return respond(429, 'Too many submissions. Please try again later.', retry)
      }
      if (result.status === 'conflict') return respond(409, 'Please refresh the form before submitting different details.')
      if (result.status === 'invalid') return respond(400, 'Please check the form fields and try again.')
    } catch { /* Never log request bodies, email, IP, signatures or upstream error details. */ }
    return respond(503, 'Submissions are temporarily unavailable.')
  }
}

function environmentConfig(): GatewayConfig {
  return {
    enabled: process.env.SUBMISSIONS_ENABLED === 'true', vercel: process.env.VERCEL, vercelEnvironment: process.env.VERCEL_ENV,
    allowedOrigins: (process.env.SUBMISSIONS_ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    audience: process.env.SUBMISSIONS_AUDIENCE ?? '', keyId: process.env.SUBMISSIONS_KEY_ID ?? '',
    signingKeyHex: process.env.SUBMISSIONS_SIGNING_KEY_HEX ?? '', privacyKeyHex: process.env.SUBMISSIONS_PRIVACY_KEY_HEX ?? '',
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  }
}

export async function handlePublicSubmission(request: Request, kind: SubmissionKind): Promise<Response> {
  const config = environmentConfig()
  const transport = async (signed: SignedSubmission): Promise<GatewayReply> => {
    const url = new URL(config.supabaseUrl)
    if (url.protocol !== 'https:' || !/^[a-z0-9]+\.supabase\.co$/.test(url.hostname) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash || !config.anonKey) throw new Error('Transport unavailable')
    const response = await fetch(new URL('/rest/v1/rpc/submit_public_form', url), {
      method: 'POST', headers: { apikey: config.anonKey, Authorization: 'Bearer ' + config.anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(signed), redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) throw new Error('Transport unavailable')
    return await response.json() as GatewayReply
  }
  return createSubmissionHandler(config, { now: Date.now, transport, identity: req => vercelClientIdentity(req, config) })(request, kind)
}
