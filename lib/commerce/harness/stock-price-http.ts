import { createHash, timingSafeEqual } from 'node:crypto'
import { syncStockPrice } from './sync'
import type { SyncDependencies } from './sync'

/** Factory keeps auth and real route behaviour testable without env edits or external services. */
export function createStockPriceHandler(options: {
  env: () => Record<string, string | undefined>;
  load?: () => Promise<Omit<SyncDependencies, 'writeEnabled'>>
}) {
  return async (request: Request): Promise<Response> => {
    const env = options.env()
    const respond = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
    if (!env.CRON_SECRET) return respond({ error: 'cron_auth_not_configured' }, 503)
    const expected = createHash('sha256').update(`Bearer ${env.CRON_SECRET}`).digest()
    const supplied = createHash('sha256').update(request.headers.get('authorization') ?? '').digest()
    if (!timingSafeEqual(expected, supplied)) return respond({ error: 'unauthorised' }, 401)
    if (env.HARNESS_ENABLED !== 'true') return respond({ status: 'disabled' })
    // TODO(T05/Toby/Lifty): saved mapping, trusted feed receipt, reviewed pricing, existing Shopify writer,
    // private run/diff persistence and alert delivery. No live connector is constructed in T08.
    if (!options.load) return respond({ error: 'harness_dependencies_not_configured' }, 503)
    try {
      const result = await syncStockPrice({ ...await options.load(), writeEnabled: env.HARNESS_WRITE_ENABLED })
      // Return aggregates only: private SKU, cost, price and mapping data stay server-side.
      return respond({ status: result.status, diffs: result.diffs.length,
        applied: result.diffs.filter(diff => diff.applied).length, alerts: result.alerts }, result.status === 'failed' || result.status === 'uncertain' ? 503 : 200)
    } catch { return respond({ error: 'harness_run_failed' }, 503) }
  }
}
