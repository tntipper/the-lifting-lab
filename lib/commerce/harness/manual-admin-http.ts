import type { ManualQueueStore } from './manual-queue'
export type AdminIdentity = { id: string; admin: boolean }
export type ManualAdminDependencies = {
  authenticate: () => Promise<AdminIdentity | null>;
  enabled?: string; store?: ManualQueueStore
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!))
const headers = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'", 'X-Content-Type-Options': 'nosniff' }
/** HTML route serves the admin page and same-origin mark-done forms, with an actual HTTP 403. */
export function createManualAdminHandler(deps: ManualAdminDependencies) {
  return async (request: Request) => {
    const respond = (text: string, status: number) => new Response(text, { status, headers })
    let user: AdminIdentity | null
    try { user = await deps.authenticate() } catch { return respond('Forbidden', 403) }
    if (!user?.admin || !user.id) return respond('Forbidden', 403)
    if (deps.enabled !== 'true') return respond('Harness operator queue is disabled.', 503)
    if (!deps.store) return respond('Operator queue connection needs approval and configuration.', 503)
    if (!['GET', 'POST'].includes(request.method)) return respond('Method not allowed', 405)
    try {
      if (request.method === 'POST') {
        // Browser cookies alone must not authorise a cross-site mark-done request.
        if (request.headers.get('origin') !== new URL(request.url).origin) return respond('Forbidden', 403)
        if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return respond('Invalid form', 400)
        const body = await request.text()
        if (body.length > 1024) return respond('Invalid form', 400)
        const form = new URLSearchParams(body), id = form.get('id') ?? ''
        if (form.get('action') !== 'done' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return respond('Invalid form', 400)
        if (!await deps.store.markDone(id, user.id)) return respond('Item is already done or does not exist.', 409)
        return new Response(null, { status: 303, headers: { ...headers, Location: '/admin/harness' } })
      }
      const items = await deps.store.listOpen()
      const rows = items.map(item => `<tr><td>${escape(item.id)}</td><td>${escape(item.createdAt)}</td><td>${escape(item.job)}</td><td>${escape(item.code)}</td><td>${escape(item.supplier ?? '—')}</td><td>${escape(item.orderId ?? '—')}</td><td><form method="post" action="/admin/harness"><input type="hidden" name="id" value="${escape(item.id)}"><input type="hidden" name="action" value="done"><button type="submit">Mark done</button></form></td></tr>`).join('')
      return new Response(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TLL harness operator queue</title></head><body><main><h1>Harness operator queue</h1><p>${items.length} open items. Reconcile uncertain operations in the supplier portal or Shopify before marking done. Marking done records review only; it does not resend orders or release reservations.</p><table><caption>Items needing review</caption><thead><tr><th scope="col">Queue ID</th><th scope="col">Created</th><th scope="col">Job</th><th scope="col">Reason</th><th scope="col">Supplier</th><th scope="col">Order reference</th><th scope="col">Action</th></tr></thead><tbody>${rows}</tbody></table>${items.length ? '' : '<p>No open items.</p>'}</main></body></html>`,
        { status: 200, headers: { ...headers, 'Content-Type': 'text/html; charset=utf-8' } })
    } catch { return respond('Operator queue unavailable.', 503) }
  }
}
