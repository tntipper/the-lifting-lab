import { createStagingPostgresRuntime, STAGING_POSTGRES_PROJECT_REF } from './staging-postgres'

const roles = Object.freeze(['customer', 'cart', 'provisional', 'bridge'] as const)
type Purpose = typeof roles[number]
type Environment = Readonly<Record<string, string | undefined>>
type RuntimeFactory = typeof createStagingPostgresRuntime
type Result = Readonly<{ status: 'PASS' | 'FAIL'; checks: Readonly<Record<Purpose, 'PASS' | 'FAIL'>> }>

/** Protected Preview only. Never returns a password, SQL result or driver error. */
export async function checkStagingWebsiteConsumers(env: Environment,
  createRuntime: RuntimeFactory = createStagingPostgresRuntime): Promise<Result | null> {
  if (env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview'
    || env.VERCEL_GIT_COMMIT_REF !== 'codex/tll-integration'
    || env.TLL_STAGING_SUPABASE_PROJECT_REF !== STAGING_POSTGRES_PROJECT_REF
    || env.TLL_STAGING_CUSTOMER_ENABLED !== 'false' || env.TLL_STAGING_CART_ENABLED !== 'false'
    || env.TLL_STAGING_CART_CHECKOUT_HANDOFF_ENABLED !== 'false') return null
  const caPem = env.TLL_STAGING_POSTGRES_CA_PEM
  const caSha = env.TLL_STAGING_POSTGRES_CA_SHA256
  if (!caPem || !caSha || !/^[a-f0-9]{64}$/.test(caSha)) return null
  const checks = {} as Record<Purpose, 'PASS' | 'FAIL'>
  for (const purpose of roles) {
    const password = env[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`]
    let runtime: ReturnType<RuntimeFactory> | undefined
    let client: Awaited<ReturnType<ReturnType<RuntimeFactory>['pool']['connect']>> | undefined
    try {
      if (!password || password.length < 32) throw Error('held')
      runtime = createRuntime({ purpose, enabled: true, password, tlsCa: { pem: caPem, sha256: caSha } })
      client = await runtime.pool.connect()
      const result = await client.query('SELECT current_user::text AS role')
      checks[purpose] = result.rows.length === 1
        && result.rows[0]?.role === `tll_${purpose}_runtime` ? 'PASS' : 'FAIL'
    } catch { checks[purpose] = 'FAIL' }
    finally {
      try { client?.release(true) } catch { checks[purpose] = 'FAIL' }
      try { await runtime?.close() } catch { checks[purpose] = 'FAIL' }
    }
  }
  return Object.freeze({ status: roles.every(purpose => checks[purpose] === 'PASS') ? 'PASS' : 'FAIL',
    checks: Object.freeze(checks) })
}
