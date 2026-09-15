import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { CATEGORIES } from '../lib/categories.ts'
import { submissionSizeError, SUBMISSION_BODY_BYTE_LIMIT } from '../lib/submissions/body-size.mjs'
import { SUBMISSION_CATEGORIES, SUBMISSION_LIMITS, createSubmissionHandler, handlePublicSubmission, signSubmission, validateSubmission, vercelClientIdentity } from '../lib/submissions/gateway.ts'

const config = () => ({ enabled: true, vercel: '1', vercelEnvironment: 'preview', allowedOrigins: ['https://forms.example.test'], audience: 'tll-submissions:synthetic', keyId: 'synthetic-1', signingKeyHex: '12'.repeat(32), privacyKeyHex: '34'.repeat(32), supabaseUrl: 'https://synthetic.supabase.co', anonKey: 'synthetic-anon' })
const body = () => ({ name: 'Synthetic User', email: 'test@example.test', message: 'Synthetic enquiry.' })
const supplement = () => ({ category: 'creatine', brand: 'Synthetic', product: 'Synthetic monohydrate', url: 'https://brand.example.test/product', notes: '', email: '' })
const request = (value = body(), headers = {}, method = 'POST') => new Request('https://forms.example.test/api/contact', { method, headers: { origin: 'https://forms.example.test', 'content-type': 'application/json', 'idempotency-key': randomUUID(), 'x-vercel-forwarded-for': '192.0.2.1', ...headers }, ...(method === 'POST' ? { body: typeof value === 'string' ? value : JSON.stringify(value) } : {}) })
function harness(overrides = {}, reply = { status: 'accepted' }) {
  const calls = [], cfg = { ...config(), ...overrides }
  const handler = createSubmissionHandler(cfg, { now: () => 1_789_467_600_000, identity: req => vercelClientIdentity(req, cfg), transport: async signed => { calls.push(signed); if (reply instanceof Error) throw reply; return reply } })
  return { calls, handler, cfg }
}

test('category allow-list agrees with existing public form categories', () => assert.deepEqual(SUBMISSION_CATEGORIES, CATEGORIES.map(category => category.slug)))
test('valid contact receives a receipt after one narrowly signed transport call', async () => {
  const { handler, calls } = harness()
  const response = await handler(request(), 'contact')
  assert.equal(response.status, 202); assert.deepEqual(await response.json(), { ok: true })
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(calls.length, 1)
  assert.deepEqual(Object.keys(calls[0]), ['p_key_id', 'p_payload', 'p_signature'])
  const payload = JSON.parse(calls[0].p_payload)
  assert.equal(payload.kind, 'contact'); assert.equal(payload.body_json, JSON.stringify(body()))
  assert.equal(payload.ip_subject.includes('192.0.2.1'), false)
  assert.equal(payload.email_subject.includes('test@example.test'), false)
  assert.equal(calls[0].p_payload.includes(config().signingKeyHex), false)
})
test('HMAC binds exact bytes, audience, kind, time, identity, request id and body digest', () => {
  const cfg = config(), id = randomUUID(), signed = signSubmission('contact', body(), id, '192.0.2.1', cfg, 1_789_467_600_000)
  assert.equal(signed.p_signature, createHmac('sha256', Buffer.from(cfg.signingKeyHex, 'hex')).update(signed.p_payload).digest('hex'))
  const payload = JSON.parse(signed.p_payload)
  assert.equal(payload.body_sha256, createHash('sha256').update(payload.body_json).digest('hex'))
  for (const key of Object.keys(payload)) {
    const modified = { ...payload, [key]: String(payload[key]) + 'x' }
    assert.notEqual(createHmac('sha256', Buffer.from(cfg.signingKeyHex, 'hex')).update(JSON.stringify(modified)).digest('hex'), signed.p_signature, key)
  }
  assert.notEqual(createHmac('sha256', Buffer.from(cfg.signingKeyHex, 'hex')).update(signed.p_payload + ' ').digest('hex'), signed.p_signature)
})
for (const change of [
  { enabled: false }, { vercel: undefined }, { vercelEnvironment: 'development' }, { signingKeyHex: '' },
  { privacyKeyHex: '12'.repeat(32) }, { allowedOrigins: [] }, { allowedOrigins: ['http://forms.example.test'] }, { audience: 'bad' }, { keyId: 'bad key' },
]) test('missing or disabled runtime configuration fails closed: ' + JSON.stringify(Object.keys(change)), async () => {
  const { handler, calls } = harness(change)
  assert.equal((await handler(request(), 'contact')).status, 503)
  assert.equal(calls.length, 0)
})
test('generic forwarded headers cannot replace Vercel trusted identity', async () => {
  const req = request(); req.headers.delete('x-vercel-forwarded-for'); req.headers.set('x-forwarded-for', '192.0.2.2'); req.headers.set('x-real-ip', '192.0.2.2')
  const { handler, calls } = harness()
  assert.equal((await handler(req, 'contact')).status, 503); assert.equal(calls.length, 0)
})
for (const value of ['192.0.2.1, 192.0.2.2', 'garbage', '192.000.2.1']) test('ambiguous identity rejected: ' + value, () => {
  assert.equal(vercelClientIdentity(request(body(), { 'x-vercel-forwarded-for': value }), config()), null)
})
test('IPv6 spelling is canonicalized; Vercel header wins over injected generic header', () => {
  const first = vercelClientIdentity(request(body(), { 'x-vercel-forwarded-for': '2001:db8::1', 'x-forwarded-for': '192.0.2.66' }), config())
  assert.equal(first, vercelClientIdentity(request(body(), { 'x-vercel-forwarded-for': '2001:0DB8:0:0:0:0:0:1' }), config()))
})
for (const [value, headers, expected] of [
  [body(), { origin: 'https://attacker.example.test' }, 403],
  [body(), { 'idempotency-key': 'not-a-uuid' }, 400],
  [body(), { 'content-type': 'text/plain' }, 415],
  [body(), { 'content-encoding': 'gzip' }, 415],
  [body(), { 'content-length': '16385' }, 413],
  [body(), { 'content-length': '-1' }, 413],
  ['{', {}, 400], [[], {}, 400], [null, {}, 400],
  [{ ...body(), name: 23 }, {}, 400], [{ ...body(), message: ' ' }, {}, 400],
  [{ ...body(), email: 'not-email' }, {}, 400], [{ ...body(), extra: 'unexpected' }, {}, 400],
  [{ ...body(), message: 'x'.repeat(8001) }, {}, 400], [{ ...body(), message: '\u0000' }, {}, 400],
  [{ ...body(), message: '\ud800' }, {}, 400], ['x'.repeat(16385), {}, 413],
]) test('invalid boundary returns ' + expected + ' without transport: ' + JSON.stringify(headers) + String(value).slice(0, 15), async () => {
  const { handler, calls } = harness()
  assert.equal((await handler(request(value, headers), 'contact')).status, expected)
  assert.equal(calls.length, 0)
})
test('stream byte cap applies even with misleading Content-Length', async () => {
  const { handler, calls } = harness()
  assert.equal((await handler(request('x'.repeat(SUBMISSION_LIMITS.bodyBytes + 1), { 'content-length': '1' }), 'contact')).status, 413)
  assert.equal(calls.length, 0)
})
test('browser-safe size check rejects multibyte text permitted by HTML maxlength', () => {
  const value = JSON.stringify({ ...body(), message: '“'.repeat(8000) })
  assert.ok(new TextEncoder().encode(value).byteLength > SUBMISSION_BODY_BYTE_LIMIT)
  assert.match(submissionSizeError(value), /shorten/)
  assert.equal(submissionSizeError('x'.repeat(SUBMISSION_BODY_BYTE_LIMIT)), null)
  assert.match(submissionSizeError('x'.repeat(SUBMISSION_BODY_BYTE_LIMIT + 1)), /shorten/)
  assert.equal(SUBMISSION_LIMITS.bodyBytes, SUBMISSION_BODY_BYTE_LIMIT)
})
test('optional supplement email/notes become explicit empty strings', () => {
  const value = supplement(); delete value.notes; delete value.email
  assert.deepEqual(validateSubmission('supplement', value), supplement())
})
test('safe HTTPS URLs normalize without requiring users to add a trailing slash', () => {
  assert.equal(validateSubmission('supplement', { ...supplement(), url: 'https://EXAMPLE.test' }).url, 'https://example.test/')
})
for (const url of ['http://example.test/product', 'https://user:pass@example.test/product', 'https://127.0.0.1/product', 'https://localhost/product', 'https://example.test/product#part', 'javascript:alert(1)']) test('unsafe or noncanonical URL held: ' + url, () => {
  assert.equal(validateSubmission('supplement', { ...supplement(), url }), null)
})
test('HTML remains plain message text and HTTPS evidence URLs are not fetched', async () => {
  const { handler, calls } = harness()
  assert.equal((await handler(request({ ...body(), message: '<script>alert(1)</script>' }), 'contact')).status, 202)
  assert.equal(JSON.parse(JSON.parse(calls[0].p_payload).body_json).message, '<script>alert(1)</script>')
})
for (const [reply, status] of [[{ status: 'duplicate' }, 202], [{ status: 'rate_limited', retry_after_seconds: 17 }, 429], [{ status: 'conflict' }, 409], [{ status: 'invalid' }, 400], [{ status: 'rejected' }, 503], [{ status: 'unavailable' }, 503], [new Error('PRIVATE_PAYLOAD'), 503]]) test('bounded transport outcome: ' + status + ':' + (reply.status ?? 'error'), async () => {
  const { handler } = harness({}, reply)
  const response = await handler(request(), 'contact')
  assert.equal(response.status, status)
  if (status === 429) assert.equal(response.headers.get('retry-after'), '17')
  assert.equal((await response.text()).includes('PRIVATE_PAYLOAD'), false)
})
test('production entry point stays disabled without secret provisioning', async () => {
  const old = process.env.SUBMISSIONS_ENABLED; delete process.env.SUBMISSIONS_ENABLED
  try { assert.equal((await handlePublicSubmission(request(), 'contact')).status, 503) }
  finally { if (old === undefined) delete process.env.SUBMISSIONS_ENABLED; else process.env.SUBMISSIONS_ENABLED = old }
})
test('forms have associated labels, maxlengths, retry ids and honest receipts', async () => {
  const contact = await readFile(new URL('../app/contact/page.tsx', import.meta.url), 'utf8')
  const suggest = await readFile(new URL('../app/submit/page.tsx', import.meta.url), 'utf8')
  for (const source of [contact, suggest]) {
    assert.ok(source.includes('Idempotency-Key')); assert.ok(source.includes('role="alert"'))
    for (const match of source.matchAll(/htmlFor="([^"]+)"/g)) assert.ok(source.includes('id="' + match[1] + '"'))
    assert.equal(/ping you|when it&apos;s live|within a few days|we&apos;ll get back/i.test(source), false)
    assert.ok(source.indexOf('submissionSizeError(body)') < source.indexOf('await fetch('))
    assert.ok(source.includes("if (sizeError) { setErrorMessage(sizeError); setStatus('error'); return }"))
  }
  assert.ok(contact.includes('Message received for review.'))
  assert.ok(suggest.includes('Suggestion received for review.'))
})
test('both route modules use the narrow gateway with no public-insert or service-role fallback', async () => {
  for (const path of ['contact', 'submit-supplement']) {
    const source = await readFile(new URL(`../app/api/${path}/route.ts`, import.meta.url), 'utf8')
    assert.ok(source.includes('handlePublicSubmission'))
    assert.ok(source.includes("runtime = 'nodejs'"))
    assert.equal(/createPublicClient|service_role|\.insert\(/.test(source), false)
  }
})
