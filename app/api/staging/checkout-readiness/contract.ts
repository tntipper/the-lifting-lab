import { buildStagingReadinessResponse } from '../readiness/contract'

type Input = Parameters<typeof buildStagingReadinessResponse>[0]

/** The existing protected deployment check is reused; only one extra OFF/ON bit is exposed. */
export function buildStagingCheckoutReadinessResponse(input: Input) {
  const base = buildStagingReadinessResponse(input)
  if (base.status !== 200) return base
  return Object.freeze({ status: 200, headers: base.headers, body: Object.freeze({
    deploymentId: base.body.deploymentId,
    immutableUrl: base.body.immutableUrl,
    projectRef: base.body.projectRef,
    branch: base.body.branch,
    checkoutHandoffEnabled: input.env.TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED === 'true',
  }) })
}
