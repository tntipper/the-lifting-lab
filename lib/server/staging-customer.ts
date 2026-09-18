// Node-only staging composition. Importing performs no credential, database or provider work.
import { createCustomerAdmissionBrowserDelivery } from '@/lib/identity/customer-admission-browser-delivery'
import { STAGING_CUSTOMER_CLIENT_ID, STAGING_DISCOVERY, STAGING_ISSUER, STAGING_SHOP_ID } from '@/lib/identity/customer-connection'
import { createShopifyCustomerJwksLoader, createShopifyCustomerTokenAdapter } from '@/lib/identity/customer-http'
import { createCustomerShopifyProofFlow, shopifyProofConfigHash } from '@/lib/identity/customer-shopify-proof'
import { createCustomerShopifyProofRepository } from '@/lib/identity/customer-shopify-proof-repository'
import { createCustomerFinalReconciliation } from '@/lib/identity/customer-final-reconciliation'
import { createCustomerFinalReconciliationRepository } from '@/lib/identity/customer-final-reconciliation-repository'
import { createSupabaseFinalExchange } from '@/lib/identity/supabase-final-exchange'
import { createCustomerAccountOperations } from '@/lib/identity/customer-account-operations'
import { createCustomerAccountOperationsRepository } from '@/lib/identity/customer-account-operations-repository'
import { createCustomerAccountLogoutRepository } from '@/lib/identity/customer-account-logout-repository'
import { createCustomerOrdersReader } from '@/lib/identity/customer-orders'
import { createStagingSupabaseSessionReader } from '@/lib/identity/supabase-session-proof'
import { createAesGcmEnvelopeVault, type EnvelopeVault } from '@/lib/identity/customer-token-vault'
import { createStagingPostgresRuntime, STAGING_POSTGRES_PROJECT_REF,
  type StagingPostgresPool, type StagingPostgresRuntime } from '@/lib/server/staging-postgres'

const PURPOSES = ['customer', 'broker', 'provisional', 'bridge'] as const
const originPattern = /^https:\/\/the-lifting-[a-z0-9-]+-my-lifting-lab-s-projects\.vercel\.app$/
const unavailable = () => new Error('Staging customer runtime unavailable')

type RuntimeFactory = typeof createStagingPostgresRuntime
type VaultFactory = typeof createAesGcmEnvelopeVault
type DeliveryFactory = typeof createCustomerAdmissionBrowserDelivery
type ProofRepositoryFactory = typeof createCustomerShopifyProofRepository
type ProofFlowFactory = typeof createCustomerShopifyProofFlow
type TokenAdapterFactory = typeof createShopifyCustomerTokenAdapter
type JwksLoaderFactory = typeof createShopifyCustomerJwksLoader
type FinalRepositoryFactory = typeof createCustomerFinalReconciliationRepository
type FinalExchangeFactory = typeof createSupabaseFinalExchange
type FinalReconciliationFactory = typeof createCustomerFinalReconciliation
type AccountOperationsFactory = typeof createCustomerAccountOperations
type AccountRepositoryFactory = typeof createCustomerAccountOperationsRepository
type AccountLogoutRepositoryFactory = typeof createCustomerAccountLogoutRepository
type OrdersReaderFactory = typeof createCustomerOrdersReader
type SessionReaderFactory = typeof createStagingSupabaseSessionReader
type Dependencies = { runtimeFactory?: RuntimeFactory; vaultFactory?: VaultFactory; deliveryFactory?: DeliveryFactory
  proofRepositoryFactory?: ProofRepositoryFactory; proofFlowFactory?: ProofFlowFactory
  tokenAdapterFactory?: TokenAdapterFactory; jwksLoaderFactory?: JwksLoaderFactory
  finalRepositoryFactory?: FinalRepositoryFactory; finalExchangeFactory?: FinalExchangeFactory
  finalReconciliationFactory?: FinalReconciliationFactory; accountOperationsFactory?: AccountOperationsFactory
  accountRepositoryFactory?: AccountRepositoryFactory; accountLogoutRepositoryFactory?: AccountLogoutRepositoryFactory
  ordersReaderFactory?: OrdersReaderFactory; sessionReaderFactory?: SessionReaderFactory }
type Environment = Readonly<Record<string, string | undefined>>
type Delivery = ReturnType<DeliveryFactory>

export type StagingCustomerRuntime = Readonly<{
  enabled: true
  delivery: Delivery
  shopifyProof: ReturnType<ProofFlowFactory>
  finalReconciliation: ReturnType<FinalReconciliationFactory>
  accountOperations: ReturnType<AccountOperationsFactory>
  accountLogoutRepository: ReturnType<AccountLogoutRepositoryFactory>
  customerPool: StagingPostgresPool
  tokenVault: EnvelopeVault
  connection: Readonly<{
    projectRef: typeof STAGING_POSTGRES_PROJECT_REF
    shopId: typeof STAGING_SHOP_ID
    clientId: typeof STAGING_CUSTOMER_CLIENT_ID
    issuer: typeof STAGING_ISSUER
    discovery: typeof STAGING_DISCOVERY
  }>
  close(): Promise<void>
}>

function hexKey(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
}
function keyId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
}
function password(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 32 && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value)
}
function timestamp(value: unknown): value is number {
  return typeof value === 'string' && /^(?:[1-9][0-9]{0,14})$/.test(value) && Number.isSafeInteger(Number(value))
}
function evidenceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
}

/**
 * Build one request-scoped staging customer runtime from server-owned configuration.
 * The optional dependencies are an offline-test seam, not a route or browser API.
 * The returned runtime owns final reconciliation as well as admission delivery;
 * hosted configuration and activation remain separate reviewed work units.
 */
export function createStagingCustomerRuntime(input: {
  readAccessToken(): Promise<string | null>
  env?: Environment
}, dependencies: Dependencies = {}): StagingCustomerRuntime | null {
  const env = input.env ?? process.env
  if (typeof window !== 'undefined' || typeof input.readAccessToken !== 'function'
    || env.NEXT_PUBLIC_TLL_ENVIRONMENT !== 'staging' || env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER !== 'enabled'
    || env.TLL_STAGING_CUSTOMER_ENABLED !== 'true' || env.VERCEL !== '1' || env.VERCEL_ENV !== 'preview') return null

  const origin = env.TLL_STAGING_CUSTOMER_ORIGIN ?? ''
  const projectRef = env.TLL_STAGING_SUPABASE_PROJECT_REF ?? ''
  const publishableKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''
  const caPem = env.TLL_STAGING_POSTGRES_CA_PEM ?? '', caSha = env.TLL_STAGING_POSTGRES_CA_SHA256 ?? ''
  const customerClientSecret = env.TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET ?? ''
  const subjectBrokerClientSecret = env.TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET ?? ''
  const proofEvidenceId = env.TLL_STAGING_SHOPIFY_PROOF_EVIDENCE_ID ?? ''
  const proofConfigHash = env.TLL_STAGING_SHOPIFY_PROOF_CONFIG_SHA256 ?? ''
  const proofVerifiedAt = env.TLL_STAGING_SHOPIFY_PROOF_VERIFIED_AT_MS ?? ''
  const proofExpiresAt = env.TLL_STAGING_SHOPIFY_PROOF_EXPIRES_AT_MS ?? ''
  const passwords = PURPOSES.map(purpose => env[`TLL_STAGING_${purpose.toUpperCase()}_DATABASE_PASSWORD`])
  const vaults = [
    ['token', env.TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_ID, env.TLL_STAGING_CUSTOMER_TOKEN_VAULT_KEY_HEX],
    ['provisional', env.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_ID, env.TLL_STAGING_CUSTOMER_PROVISIONAL_VAULT_KEY_HEX],
    ['cookie', env.TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_ID, env.TLL_STAGING_CUSTOMER_COOKIE_VAULT_KEY_HEX],
    ['final', env.TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_ID, env.TLL_STAGING_CUSTOMER_FINAL_VAULT_KEY_HEX],
  ] as const

  if (!originPattern.test(origin) || new URL(origin).origin !== origin || origin.length > 253
    || projectRef !== STAGING_POSTGRES_PROJECT_REF || env.NEXT_PUBLIC_SUPABASE_URL !== `https://${projectRef}.supabase.co`
    || !/^sb_publishable_[A-Za-z0-9_-]{16,256}$/.test(publishableKey)
    || !caPem || !/^[a-f0-9]{64}$/.test(caSha)
    || !password(customerClientSecret) || !password(subjectBrokerClientSecret) || customerClientSecret === subjectBrokerClientSecret
    || !evidenceId(proofEvidenceId) || !/^[a-f0-9]{64}$/.test(proofConfigHash)
    || !timestamp(proofVerifiedAt) || !timestamp(proofExpiresAt) || Number(proofExpiresAt) <= Number(proofVerifiedAt)
    || Number(proofExpiresAt) - Number(proofVerifiedAt) > 86_400_000
    || passwords.some(value => !password(value)) || new Set(passwords).size !== PURPOSES.length
    || vaults.some(([, id, key]) => !keyId(id) || !hexKey(key))
    || new Set(vaults.map(([, id]) => id)).size !== vaults.length
    || new Set(vaults.map(([, , key]) => key)).size !== vaults.length) return null

  const proofConfig = { applicationOrigin: origin, verification: { evidenceId: proofEvidenceId,
    configHash: proofConfigHash, verifiedAt: Number(proofVerifiedAt), expiresAt: Number(proofExpiresAt) } }
  if (shopifyProofConfigHash(proofConfig) !== proofConfigHash) return null

  const runtimeFactory = dependencies.runtimeFactory ?? createStagingPostgresRuntime
  const vaultFactory = dependencies.vaultFactory ?? createAesGcmEnvelopeVault
  const deliveryFactory = dependencies.deliveryFactory ?? createCustomerAdmissionBrowserDelivery
  const proofRepositoryFactory = dependencies.proofRepositoryFactory ?? createCustomerShopifyProofRepository
  const proofFlowFactory = dependencies.proofFlowFactory ?? createCustomerShopifyProofFlow
  const tokenAdapterFactory = dependencies.tokenAdapterFactory ?? createShopifyCustomerTokenAdapter
  const jwksLoaderFactory = dependencies.jwksLoaderFactory ?? createShopifyCustomerJwksLoader
  const finalRepositoryFactory = dependencies.finalRepositoryFactory ?? createCustomerFinalReconciliationRepository
  const finalExchangeFactory = dependencies.finalExchangeFactory ?? createSupabaseFinalExchange
  const finalReconciliationFactory = dependencies.finalReconciliationFactory ?? createCustomerFinalReconciliation
  const accountOperationsFactory = dependencies.accountOperationsFactory ?? createCustomerAccountOperations
  const accountRepositoryFactory = dependencies.accountRepositoryFactory ?? createCustomerAccountOperationsRepository
  const accountLogoutRepositoryFactory = dependencies.accountLogoutRepositoryFactory ?? createCustomerAccountLogoutRepository
  const ordersReaderFactory = dependencies.ordersReaderFactory ?? createCustomerOrdersReader
  const sessionReaderFactory = dependencies.sessionReaderFactory ?? createStagingSupabaseSessionReader
  const runtimes: StagingPostgresRuntime[] = [], keyrings: EnvelopeVault[] = [], keyBytes: Buffer[] = []
  let closed = false
  const close = async () => {
    if (closed) return
    closed = true
    for (const vault of keyrings.splice(0)) try { vault.destroy() } catch { /* remaining resources must still close */ }
    await Promise.allSettled(runtimes.splice(0).map(runtime => runtime.close()))
  }
  try {
    for (const [index, purpose] of PURPOSES.entries()) {
      const runtime = runtimeFactory({ purpose, enabled: true, password: passwords[index], tlsCa: { pem: caPem, sha256: caSha } })
      if (!runtime.enabled) throw unavailable()
      runtimes.push(runtime)
    }
    for (const [, id, key] of vaults) {
      const bytes = Buffer.from(key!, 'hex'); keyBytes.push(bytes)
      const vault = vaultFactory({ activeKeyId: id!, keys: new Map([[id!, bytes]]) })
      keyrings.push(vault)
    }
    const [customer, broker, provisional, bridge] = runtimes
    const [tokenVault, provisionalVault, cookieVault, finalVault] = keyrings
    const proofRepository = proofRepositoryFactory({ pool: customer.pool, vault: tokenVault,
      syntheticExecution: true, liveEnabled: false })
    const tokenAdapter = tokenAdapterFactory({ enabled: true, clientSecret: customerClientSecret,
      callbackUrl: `${origin}/auth/customer/shopify/callback`, authorizationScope: 'openid email customer-account-api:full' })
    const jwks = jwksLoaderFactory({ enabled: true })
    const shopifyProof = proofFlowFactory({ config: proofConfig, ports: { repository: proofRepository,
      exchangeCode: tokenAdapter.exchangeCode, verifyIdToken: jwks.verifyIdToken, now: Date.now },
      syntheticExecution: true, liveEnabled: false })
    const delivery = deliveryFactory({ provisionalPool: provisional.pool, bridgePool: bridge.pool, brokerPool: broker.pool,
      vault: provisionalVault, cookieVault, applicationOrigin: origin, publishableKey,
      readAccessToken: input.readAccessToken, shopifyProof, shopifyProofRepository: proofRepository,
      subjectBrokerClientSecret, syntheticExecution: true, liveEnabled: false })
    const finalRepository = finalRepositoryFactory({ pool: bridge.pool, provisionalVault, finalVault,
      syntheticExecution: true, liveEnabled: false })
    const finalExchange = finalExchangeFactory({ enabled: true, publishableKey })
    const finalReconciliation = finalReconciliationFactory({ repository: finalRepository,
      exchange: finalExchange, syntheticExecution: true, liveEnabled: false })
    const sessionReader = sessionReaderFactory({ enabled: true, publishableKey, readAccessToken: input.readAccessToken })
    const accountRepository = accountRepositoryFactory({ pool: bridge.pool, vault: tokenVault,
      syntheticExecution: true, liveEnabled: false })
    const accountOperations = accountOperationsFactory({ repository: accountRepository,
      orders: ordersReaderFactory({ enabled: true }), currentSession: sessionReader.currentSession,
      syntheticExecution: true, liveEnabled: false })
    const accountLogoutRepository = accountLogoutRepositoryFactory({ pool: bridge.pool, vault: tokenVault,
      syntheticExecution: true, liveEnabled: false })
    return Object.freeze({ enabled: true as const, delivery, shopifyProof, finalReconciliation,
      accountOperations, accountLogoutRepository, customerPool: customer.pool, tokenVault,
      connection: Object.freeze({ projectRef: STAGING_POSTGRES_PROJECT_REF, shopId: STAGING_SHOP_ID,
        clientId: STAGING_CUSTOMER_CLIENT_ID, issuer: STAGING_ISSUER, discovery: STAGING_DISCOVERY }), close })
  } catch {
    void close()
    return null
  } finally {
    for (const bytes of keyBytes) bytes.fill(0)
  }
}
