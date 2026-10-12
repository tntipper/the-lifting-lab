import { createHash, timingSafeEqual } from 'node:crypto'
import { runTracking } from './tracking'
import type { TrackingDependencies } from './tracking'

/** Cron factory: injected dependencies only, safe aggregate response, default OFF. */
export function createTrackingHandler(options: {
  env: () => Record<string, string | undefined>;
  load?: () => Promise<Omit<TrackingDependencies, 'writeEnabled'>>
}) {
  return async (request: Request): Promise<Response> => {
    const env = options.env()
    const respond = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
    if (!env.CRON_SECRET) return respond({ error: 'cron_auth_not_configured' }, 503)
    const expected = createHash('sha256').update(`Bearer ${env.CRON_SECRET}`).digest()
    const supplied = createHash('sha256').update(request.headers.get('authorization') ?? '').digest()
    if (!timingSafeEqual(expected, supplied)) return respond({ error: 'unauthorised' }, 401)
    if (env.TRACKING_WRITE_ENABLED !== 'true') return respond({ status: 'disabled' })
    // TODO(Toby/Lifty): bind approved private persistence, fresh Shopify reader + restricted writer,
    // confirmed supplier parcel/line evidence and approved scheduling. Never construct live clients here.
    if (!options.load) return respond({ error: 'tracking_dependencies_not_configured' }, 503)
    try {
      const result = await runTracking({ ...await options.load(), writeEnabled: env.TRACKING_WRITE_ENABLED })
      return respond(result, result.status === 'held' ? 503 : 200)
    } catch { return respond({ error: 'tracking_run_failed' }, 503) }
  }
}
