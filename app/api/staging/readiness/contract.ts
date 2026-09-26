export const STAGING_READINESS_HEADERS = Object.freeze({
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
})

const STAGING_REF = 'qdmvngjwkcsilzmqksme'
const STAGING_BRANCH = 'codex/tll-integration'
const held = () => Object.freeze({ status: 404, body: Object.freeze({ status: 'held' }), headers: STAGING_READINESS_HEADERS })
const enabled = (value: string | undefined) => value === 'true'
const publicEnabled = (value: string | undefined) => value === 'enabled'

export function buildStagingReadinessResponse({ env, deploymentHeader, publicEnvironmentValue, publicCustomerValue, publicCartValue }: {
  env: Record<string, string | undefined>
  deploymentHeader: string | null
  publicEnvironmentValue: string | undefined
  publicCustomerValue: string | undefined
  publicCartValue: string | undefined
}) {
  if (env.NEXT_PUBLIC_TLL_ENVIRONMENT !== 'staging' || publicEnvironmentValue !== 'staging'
    || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview'
    || env.TLL_STAGING_SUPABASE_PROJECT_REF !== STAGING_REF || env.VERCEL_GIT_COMMIT_REF !== STAGING_BRANCH) return held()
  const deploymentId = env.VERCEL_DEPLOYMENT_ID ?? ''
  const host = env.VERCEL_URL ?? ''
  const immutableUrl = /^([a-z0-9-]+\.vercel\.app)$/.test(host) ? `https://${host}` : ''
  if (!/^dpl_[A-Za-z0-9]+$/.test(deploymentId) || !immutableUrl || deploymentHeader !== deploymentId) return held()
  return Object.freeze({ status: 200, headers: STAGING_READINESS_HEADERS, body: Object.freeze({
    deploymentId, immutableUrl, projectRef: STAGING_REF, branch: STAGING_BRANCH,
    privateCustomer: enabled(env.TLL_STAGING_CUSTOMER_ENABLED), privateCart: enabled(env.TLL_STAGING_CART_ENABLED),
    publicCustomer: publicEnabled(publicCustomerValue), publicCart: publicEnabled(publicCartValue),
  }) })
}
