// Unmounted Node boundary. Responses are private delivery, never login completion.
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createCustomerAdmissionBridgeContinuation, customerBridgeReleaseHash, type CustomerBridgeRecovery } from './customer-admission-bridge-continuation'
import { createCustomerSubjectBrokerRepository } from './customer-subject-broker-repository'
import type { CustomerRepositoryPool } from './customer-connection-repository'
import type { EnvelopeVault } from './customer-token-vault'

const BOOT = '__Host-tll-customer-start', TRANSACTION = '__Host-tll-customer-transaction'
const PATH = '/auth/customer/', WINDOW = 300000, FENCE = 600000
const CONFIG = '7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
const opaque = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(v)
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const exact = (v: unknown, keys: string): v is Record<string, unknown> => object(v) && Object.keys(v).sort().join(',') === keys
const ms = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) > 0 && (v as number) < 253402300000000
const ensure: (v: unknown) => asserts v = v => { if (!v) throw new Error('Customer transaction unavailable') }
type Mode = 'sign_in' | 'migration'
type Bootstrap = { browserSecret: string; csrf: string; mode: Mode; issuedAt: number; startBefore: number; fenceAt: number }
type Capsule = { bootstrap: Bootstrap; recovery: CustomerBridgeRecovery; expiresAt: number } & (
  { phase: 'registered'; releaseSecret: string; authorizationUrl: string } | { phase: 'admitted' | 'held' })
type Options = Omit<Parameters<typeof createCustomerAdmissionBridgeContinuation>[0], 'transactionExpiresAt'> & {
  cookieVault: EnvelopeVault; brokerPool: CustomerRepositoryPool
}

/** Request-scoped trusted composition only. Requires additive migration 011.
 * The existing continuation and durable broker are owned here, never injected as
 * caller-verified flags. cookieVault must be isolated from the provisional vault.
 * Synthetic execution is only for offline/local fixtures; activation stays false. */
export function createCustomerAdmissionBrowserDelivery(input: Options) {
  const options = Object.freeze({ ...input })
  const { cookieVault, applicationOrigin: origin, brokerPool } = options
  const now = options.now ?? Date.now
  const active = () => options.syntheticExecution === true && options.liveEnabled !== true && typeof window === 'undefined'
    && /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/.test(origin)
    && new URL(origin).origin === origin && origin.length <= 253 && cookieVault !== options.vault
  const continuation = (deadline?: number) => createCustomerAdmissionBridgeContinuation({ ...options, transactionExpiresAt: deadline })
  function response(status: number, body: object | null = null) {
    return new Response(body === null ? null : JSON.stringify(body), { status, headers: {
      'cache-control': 'no-store, private', pragma: 'no-cache', 'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff', ...(body === null ? {} : { 'content-type': 'application/json' }),
    } })
  }
  const denied = () => response(409, { status: 'held' })
  function requestAt(request: Request, path: string, method: 'POST' | 'GET', query = false) {
    ensure(active() && request.method === method && !request.signal.aborted)
    const url = new URL(request.url)
    ensure(url.origin === origin && url.pathname === PATH + path && !url.hash && !url.username && !url.password
      && (query || !url.search) && request.headers.get('sec-fetch-site') === 'same-origin')
    if (method === 'POST') ensure(request.headers.get('origin') === origin)
    else ensure(request.headers.get('sec-fetch-mode') === 'navigate' && request.headers.get('sec-fetch-dest') === 'document')
  }
  function cookies(request: Request) {
    const raw = request.headers.get('cookie') ?? ''; ensure(raw.length <= 8192 && !/[\x00-\x1f\x7f]/.test(raw))
    const values = new Map<string, string>()
    for (const part of raw.split(';')) {
      const index = part.indexOf('='), name = part.slice(0, index).trim()
      if (![BOOT, TRANSACTION].includes(name)) continue
      const value = part.slice(index + 1).trim()
      ensure(index > 0 && !values.has(name) && value.length > 0 && value.length <= 3800 && /^[A-Za-z0-9_-]+$/.test(value))
      values.set(name, value)
    }
    return values
  }
  const context = (name: string) => ['tll-customer-browser-cookie/v1', origin, name, '/']
  function open<T>(value: string, name: string): T {
    const bytes = Buffer.from(value, 'base64url'); ensure(bytes.toString('base64url') === value && bytes.length <= 2850)
    return cookieVault.open<T>(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), context(name))
  }
  function setCookie(result: Response, name: string, value: object, expiresAt: number) {
    const at = now(); ensure(ms(at) && expiresAt > at)
    const encoded = Buffer.from(JSON.stringify(cookieVault.seal(value, context(name)))).toString('base64url')
    ensure(encoded.length <= 3800)
    // Round custody upward: dropping the bootstrap early must not offer a new
    // start while its last admitted intent can still be live. Server expiry is exact.
    const age = Math.ceil((expiresAt - at) / 1000); ensure(age > 0 && age <= 600)
    result.headers.append('set-cookie', `${name}=${encoded}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${age}; Expires=${new Date(expiresAt).toUTCString()}`)
  }
  function clear(result: Response) {
    for (const name of [BOOT, TRANSACTION]) result.headers.append('set-cookie', `${name}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`)
  }
  function bootstrap(value: unknown): Bootstrap {
    ensure(exact(value, 'browserSecret,csrf,fenceAt,issuedAt,mode,startBefore') && opaque(value.browserSecret) && opaque(value.csrf)
      && (value.mode === 'sign_in' || value.mode === 'migration') && ms(value.issuedAt)
      && value.startBefore === value.issuedAt + WINDOW && value.fenceAt === value.issuedAt + FENCE)
    const at = now(); ensure(ms(at) && at >= value.issuedAt && at < value.fenceAt)
    return Object.freeze({ browserSecret: value.browserSecret, csrf: value.csrf, mode: value.mode,
      issuedAt: value.issuedAt, startBefore: value.startBefore as number, fenceAt: value.fenceAt as number })
  }
  function readBootstrap(values: Map<string, string>) { const raw = values.get(BOOT); ensure(raw); return bootstrap(open(raw, BOOT)) }
  function readCapsule(values: Map<string, string>): Capsule {
    const b = readBootstrap(values), raw = values.get(TRANSACTION); ensure(raw)
    const v = open<Capsule>(raw, TRANSACTION)
    ensure(exact(v, v?.phase === 'registered' ? 'authorizationUrl,bootstrap,expiresAt,phase,recovery,releaseSecret' : 'bootstrap,expiresAt,phase,recovery')
      && ['registered', 'admitted', 'held'].includes(v.phase))
    const retained = bootstrap(v.bootstrap)
    ensure(JSON.stringify(retained) === JSON.stringify(b) && ms(v.expiresAt) && v.expiresAt <= b.fenceAt && v.expiresAt > now()
      && v.recovery?.binding?.browserHash === hash(b.browserSecret))
    // Existing digest validation checks the complete canonical recovery shape;
    // this call validates custody only and is never sent as admit authority.
    customerBridgeReleaseHash(b.browserSecret, v.recovery)
    if (v.phase === 'registered') {
      ensure(opaque(v.releaseSecret) && typeof v.authorizationUrl === 'string' && v.authorizationUrl.length <= 2048)
      const u = new URL(v.authorizationUrl); ensure(u.origin === origin && u.pathname === PATH + 'authorize' && !u.hash && !u.username && !u.password)
    }
    return v
  }
  async function form(request: Request, keys: string) {
    ensure(/^application\/x-www-form-urlencoded(?:;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '')
      && !request.headers.has('content-encoding'))
    const length = request.headers.get('content-length')
    ensure(length === null || (/^(0|[1-9][0-9]{0,3})$/.test(length) && Number(length) <= 512))
    const reader = request.body?.getReader(); ensure(reader)
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const text = await Promise.race([(async () => {
        const parts: Uint8Array[] = []; let size = 0
        for (;;) { const r = await reader.read(); if (r.done) break; size += r.value.length; ensure(size <= 512); parts.push(r.value) }
        ensure(length === null || size === Number(length)); return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts))
      })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Bounded form unavailable')), 1000) })])
      const fields = new URLSearchParams(text)
      ensure([...fields.keys()].sort().join(',') === keys && [...fields.values()].every(v => v.length <= 128 && !/[\x00-\x1f\x7f]/.test(v)))
      ensure(!request.signal.aborted); return fields
    } finally { clearTimeout(timer); void reader.cancel().catch(() => {}) }
  }
  function csrf(fields: URLSearchParams, b: Bootstrap) {
    const value = fields.get('csrf'); ensure(opaque(value) && timingSafeEqual(Buffer.from(value), Buffer.from(b.csrf)))
  }
  return Object.freeze({
    liveEnabled: false as const,
    /** Explicit same-origin POST issues or rereads the same sealed bootstrap;
     * a retained transaction permits only CSRF reread, never replacement. */
    async prepare(request: Request): Promise<Response> {
      try {
        requestAt(request, 'prepare', 'POST'); const fields = await form(request, 'mode'), mode = fields.get('mode')
        ensure(mode === 'sign_in' || mode === 'migration')
        const values = cookies(request)
        if (values.has(TRANSACTION)) {
          const c = readCapsule(values); ensure(c.bootstrap.mode === mode)
          return response(200, { csrf: c.bootstrap.csrf })
        }
        const at = now(); ensure(ms(at))
        const b = values.has(BOOT) ? readBootstrap(values) : bootstrap({ browserSecret: randomBytes(32).toString('base64url'),
          csrf: randomBytes(32).toString('base64url'), mode, issuedAt: at, startBefore: at + WINDOW, fenceAt: at + FENCE })
        ensure(b.mode === mode && now() < b.startBefore)
        const result = response(200, { csrf: b.csrf }); setCookie(result, BOOT, b, b.fenceAt); return result
      } catch { return denied() }
    },
    async start(request: Request): Promise<Response> {
      let owned: ReturnType<typeof continuation> | undefined, registered: Capsule | undefined
      try {
        requestAt(request, 'start', 'POST'); const fields = await form(request, 'csrf,mode'), values = cookies(request)
        ensure(!values.has(TRANSACTION)); const b = readBootstrap(values); csrf(fields, b)
        ensure(fields.get('mode') === b.mode && now() < b.startBefore)
        owned = continuation(b.fenceAt)
        const r = await (b.mode === 'sign_in' ? owned.startSignIn({ browserSecret: b.browserSecret }) : owned.startMigration({ browserSecret: b.browserSecret }))
        if (r.status !== 'private_registered') return denied() // Preserve bootstrap and winning attempt on prepare conflict.
        registered = { phase: 'registered', bootstrap: b, recovery: r.recovery, expiresAt: r.expiresAt,
          releaseSecret: r.releaseSecret, authorizationUrl: r.authorizationUrl }
        ensure(!request.signal.aborted && r.expiresAt <= b.fenceAt && r.expiresAt > now())
        const result = response(303); setCookie(result, TRANSACTION, registered, r.expiresAt)
        ensure(r.expiresAt > now()); result.headers.set('location', r.authorizationUrl); return result
      } catch {
        if (owned && registered) await owned.hold({ browserSecret: registered.bootstrap.browserSecret, recovery: registered.recovery })
        return denied()
      }
    },
    /** Consumes the release capability through actual 007/010 exactly once.
     * A 204 acknowledges browser admission only; no inner Shopify flow exists. */
    async admit(request: Request): Promise<Response> {
      let c: Capsule | undefined, uncertain = false
      try {
        requestAt(request, 'authorize', 'GET', true); c = readCapsule(cookies(request)); ensure(c.phase === 'registered')
        ensure(request.url === c.authorizationUrl)
        const b = c.recovery.binding, repository = createCustomerSubjectBrokerRepository({ pool: brokerPool, syntheticExecution: true })
        const payload = { operationId: randomUUID(), configHash: CONFIG, transactionId: b.transactionId,
          browserHash: b.browserHash, outerHash: b.outerHash, releaseHash: customerBridgeReleaseHash(c.releaseSecret, c.recovery) }
        uncertain = true
        // A committed rejection (including a concurrent one-use loser) must not
        // revoke a successful winner. Only unknown ACK or failed delivery holds.
        if (!await repository.admit(payload)) { uncertain = false; return denied() }
        ensure(!request.signal.aborted && c.expiresAt > now())
        const result = response(204); setCookie(result, TRANSACTION, { phase: 'admitted', bootstrap: c.bootstrap, recovery: c.recovery, expiresAt: c.expiresAt }, c.expiresAt)
        return result
      } catch {
        if (c && uncertain) await continuation().hold({ browserSecret: c.bootstrap.browserSecret, recovery: c.recovery })
        return denied()
      }
    },
    /** Inspection has no release URL/secret, registration or retry authority. */
    async recover(request: Request): Promise<Response> {
      try {
        requestAt(request, 'recover', 'POST'); const fields = await form(request, 'action,csrf'), c = readCapsule(cookies(request)); csrf(fields, c.bootstrap)
        const action = fields.get('action'); ensure(action === 'inspect' || action === 'hold' || action === 'cancel')
        const api = continuation(), input = { browserSecret: c.bootstrap.browserSecret, recovery: c.recovery }
        if (action === 'inspect') {
          const r = await api.inspect(input)
          return r ? response(200, { status: 'metadata_only', state: r.state, expiresAt: r.expiresAt, epochCurrent: r.epochCurrent }) : denied()
        }
        const r = await api[action](input), result = response(r.status === 'cancelled' ? 200 : 409, { status: r.status })
        if (r.status === 'cancelled' || r.quarantine === 'acknowledged') clear(result)
        else setCookie(result, TRANSACTION, { phase: 'held', bootstrap: c.bootstrap, recovery: c.recovery, expiresAt: c.expiresAt }, c.expiresAt)
        return result
      } catch { return denied() }
    },
  })
}
