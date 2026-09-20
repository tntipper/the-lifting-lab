#!/usr/bin/env node
import { createHash } from 'node:crypto'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const output = resolve(root, 'config/staging-account-activation-manifest.json')
const hash = async path => createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')
const pin = async path => ({ path, sha256: await hash(path) })
async function walk(directory) {
  const entries = await readdir(resolve(root, directory), { withFileTypes: true }), paths = []
  for (const entry of entries) {
    const path = `${directory}/${entry.name}`
    if (entry.isDirectory()) paths.push(...await walk(path))
    else if (/\.(?:ts|tsx|mjs|json|sql)$/.test(entry.name)) paths.push(relative(root, resolve(root, path)))
  }
  return paths
}

const migrations = [
  'supabase/migrations/202609180012_customer_shopify_proof_repository.sql',
  'supabase/migrations/202609180013_customer_final_reconciliation.sql',
  'supabase/migrations/202609180014_staging_cart_account_transition.sql',
  'supabase/migrations/202609180015_customer_account_operations.sql',
  'supabase/migrations/202609180016_customer_account_logout.sql',
]
const edgeSources = [
  'supabase/functions/tll-broker-token/index.ts', 'supabase/functions/tll-broker-token/deno.json',
  'supabase/functions/tll-broker-userinfo/index.ts', 'supabase/functions/tll-broker-userinfo/deno.json',
  'lib/identity/customer-subject-broker-edge.ts', 'lib/identity/customer-subject-broker.ts',
  'lib/identity/customer-subject-broker-repository.ts', 'lib/server/staging-postgres.ts',
]
const runtimeSources = [
  'lib/server/staging-customer.ts', 'lib/server/staging-customer-route.ts',
  'lib/identity/customer-account-operations.ts', 'lib/identity/customer-account-operations-repository.ts',
  'lib/identity/customer-account-logout.ts', 'lib/identity/customer-account-logout-repository.ts',
  'lib/identity/customer-orders.ts', 'app/api/account/orders/route.ts', 'app/auth/customer/logout/route.ts',
]
const recoverySources = [
  'scripts/staging-account-activation-recovery.mjs',
  'config/staging-account-activation-recovery.sql',
  'config/staging-account-activation-recovery-postcommit.sql',
  'docs/identity/staging-generation-6-activation.md',
]
const preflightSources = [
  'scripts/staging-readonly-preflight.mjs',
  'scripts/staging-readonly-preflight-keychain.py',
  'scripts/staging-readonly-preflight-manifest.mjs',
  'config/staging-readonly-preflight-manifest.json',
  'tests/staging-readonly-preflight-actual.mjs',
]
const disabledMigrationInstallSources = [
  'scripts/staging-disabled-migrations-012-016.prepare.mjs',
  'scripts/staging-disabled-migrations-012-016.mjs',
  'scripts/staging-disabled-migrations-012-016-keychain.py',
  'config/staging-disabled-migrations-012-016.json',
  'config/staging-disabled-migrations-012-016.sql',
  'tests/staging-disabled-migrations-012-016-actual.mjs',
]
const disabledMigrationInstallManifest = JSON.parse(await readFile(resolve(root, 'config/staging-disabled-migrations-012-016.json'), 'utf8'))
const databasePasswords = ['CUSTOMER','CART','BROKER','PROVISIONAL','BRIDGE'].map(purpose => `TLL_STAGING_${purpose}_DATABASE_PASSWORD`)
const vaults = ['TOKEN','PROVISIONAL','COOKIE','FINAL'].flatMap(purpose =>
  [`TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_ID`, `TLL_STAGING_CUSTOMER_${purpose}_VAULT_KEY_HEX`])
const vercelSecrets = [
  ...databasePasswords, ...vaults, 'TLL_STAGING_CART_VAULT_KEY_ID', 'TLL_STAGING_CART_VAULT_KEY_HEX',
  'TLL_STAGING_CART_HMAC_KEY_HEX', 'TLL_STAGING_CART_STOREFRONT_TOKEN',
  'TLL_STAGING_SHOPIFY_CUSTOMER_CLIENT_SECRET', 'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET',
]
const vercelConfiguration = [
  'NEXT_PUBLIC_TLL_ENVIRONMENT', 'NEXT_PUBLIC_TLL_STAGING_CUSTOMER', 'NEXT_PUBLIC_TLL_STAGING_CART',
  'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'TLL_STAGING_CUSTOMER_ENABLED', 'TLL_STAGING_CART_ENABLED', 'TLL_STAGING_CUSTOMER_ORIGIN', 'TLL_STAGING_CART_ORIGIN',
  'TLL_STAGING_SUPABASE_PROJECT_REF', 'TLL_STAGING_CART_SHOP', 'TLL_STAGING_POSTGRES_CA_PEM',
  'TLL_STAGING_POSTGRES_CA_SHA256', 'TLL_STAGING_SHOPIFY_PROOF_EVIDENCE_ID',
  'TLL_STAGING_SHOPIFY_PROOF_CONFIG_SHA256', 'TLL_STAGING_SHOPIFY_PROOF_VERIFIED_AT_MS',
  'TLL_STAGING_SHOPIFY_PROOF_EXPIRES_AT_MS',
]
const reviewedPreview = {
  stableOrigin: 'https://the-lifting-lab-git-codex-tll-4adea2-my-lifting-lab-s-projects.vercel.app',
  branch: 'codex/tll-integration',
  originConfiguration: ['TLL_STAGING_CUSTOMER_ORIGIN', 'TLL_STAGING_CART_ORIGIN'],
  providerUris: ['/auth/customer/shopify/callback', '/auth'],
  immutableDeploymentEvidence: {
    requiredForEachPhase: ['disabled', 'enabled'],
    requiredFields: ['deploymentId', 'immutableUrl', 'sourceCommit', 'manifestSha256'],
    aliasMustResolveToRecordedDeployment: true,
  },
}
const sourceTreePaths = [...new Set([...migrations, ...edgeSources, ...runtimeSources,
  ...await walk('lib/identity'), ...await walk('lib/server'), ...await walk('lib/commerce'),
  ...await walk('app/auth/customer'), ...await walk('app/account/orders'), ...await walk('app/api/account'),
  ...await walk('supabase/functions')])].sort()
const sourceTreePins = await Promise.all(sourceTreePaths.map(pin))
const sourceTreeSha256 = createHash('sha256').update(sourceTreePins.map(item => `${item.path}\0${item.sha256}\n`).join('')).digest('hex')

const manifest = {
  schema: 'tll-staging-account-activation/v1',
  target: { supabaseProjectRef: 'qdmvngjwkcsilzmqksme', shopDomain: 'tll-integration-staging.myshopify.com',
    vercelProjectId: 'prj_kI5iqqor8Qa63EGRyhsi8e2yxpg4', environment: 'preview', productionProjectRefExcluded: 'wrhgscovsgsudtedbljr' },
  prerequisites: { hostedMigrations: ['002','003','004','005','006','007','008','009','010','011'],
    retiredCredentialGenerations: [1,2,3,4,5], controlsRequiredDisabled: ['customer','cart','broker','provisional','bridge'],
    noLoginCredentialsInSource: true, noPurchaseJourney: true },
  sourceTree: { roots: ['lib/identity','lib/server','lib/commerce','app/auth/customer','app/account/orders','app/api/account','supabase/functions'],
    fileCount: sourceTreePins.length, sha256: sourceTreeSha256 },
  migrations: await Promise.all(migrations.map(pin)),
  edge: { functions: [
    { name: 'tll-broker-token', verifyJwt: false, protocolAuthentication: 'confidential_basic' },
    { name: 'tll-broker-userinfo', verifyJwt: false, protocolAuthentication: 'one_use_bearer' },
  ], sources: await Promise.all(edgeSources.map(pin)), requiredSecrets: [
    'TLL_STAGING_BROKER_DATABASE_PASSWORD', 'TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET',
    'TLL_STAGING_POSTGRES_CA_PEM', 'TLL_STAGING_POSTGRES_CA_SHA256',
  ], enableLast: 'TLL_STAGING_SUBJECT_BROKER_EDGE_ENABLED' },
  runtime: { sources: await Promise.all(runtimeSources.map(pin)), reviewedPreview,
    databaseIdentities: {
      customer: { login: 'tll_customer_runtime', membership: 'tll_customer_executor' },
      cart: { login: 'tll_cart_runtime', membership: 'tll_cart_gateway' },
      broker: { login: 'tll_broker_runtime', membership: 'tll_broker_executor' },
      provisional: { login: 'tll_provisional_runtime', membership: 'tll_provisional_executor' },
      bridge: { login: 'tll_bridge_runtime', membership: 'tll_bridge_executor' },
    }, vercelSecrets: vercelSecrets.sort(), vercelConfiguration: vercelConfiguration.sort(),
    enableLast: ['TLL_STAGING_CUSTOMER_ENABLED','TLL_STAGING_CART_ENABLED','NEXT_PUBLIC_TLL_STAGING_CUSTOMER','NEXT_PUBLIC_TLL_STAGING_CART'] },
  provider: { customerClientId: 'c8f7b926-9073-416c-9949-0d99e89a99c0', shopId: '107532616020',
    issuer: 'https://shopify.com/authentication/107532616020', discovery: 'https://tll-integration-staging.myshopify.com/.well-known/openid-configuration',
    authorizationEndpoint: 'https://shopify.com/authentication/107532616020/oauth/authorize',
    tokenEndpoint: 'https://shopify.com/authentication/107532616020/oauth/token',
    endSessionEndpoint: 'https://shopify.com/authentication/107532616020/logout',
    scopes: ['openid','email','customer-account-api:full'],
    reviewedPreviewOrigin: reviewedPreview.stableOrigin,
    callbackPath: '/auth/customer/shopify/callback', logoutPath: '/auth',
    subjectBrokerClientId: 'tll-staging-subject-broker-v1', subjectBrokerCallback: 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1/callback',
    subjectBrokerTokenPath: '/functions/v1/tll-broker-token', subjectBrokerUserinfoPath: '/functions/v1/tll-broker-userinfo' },
  preflight: {
    sources: await Promise.all(preflightSources.map(pin)),
    queryId: 'tll-staging-readonly-preflight/v1',
    maximumRequests: 1,
    productionExcluded: true,
    actualPostgresAcceptanceRequired: true,
  },
  disabledMigrationInstall: {
    sources: await Promise.all(disabledMigrationInstallSources.map(pin)),
    installId: 'tll-staging-disabled-migrations-012-016/v1',
    transactionSha256: disabledMigrationInstallManifest.transactionSha256,
    nativeAccessApproved: false,
    maximumRequests: 1,
    executionPolicy: 'HOLD_UNTIL_ALL_REVIEWED_GATES_PASS',
    prerequisites: ['authenticated_read_only_preflight_pass','management_api_status_and_envelope_confirmed','enabled_source_and_manifest_pins_verified'],
    dispatchJournal: {
      path: '../implementation-state/staging/tll-disabled-migrations-012-016-dispatch.json',
      exclusiveClaimRequired: true,
      noRetryAfterDispatch: true,
      uncertainState: 'RECONCILIATION_REQUIRED',
      successState: 'RECEIPT_VALIDATED',
    },
    actualPostgresAcceptanceRequired: true,
  },
  recovery: {
    sources: await Promise.all(recoverySources.map(pin)),
    requiredInstalledMigrations: ['012','013','014','015','016'],
    activationWindow: { generation: 6, windowId: '83888906-23fa-4653-a886-fe2733ed76a0' },
    disablesControls: ['customer','cart','broker','provisional','bridge'],
    retiresRuntimeLogins: ['tll_customer_runtime','tll_cart_runtime','tll_broker_runtime','tll_provisional_runtime','tll_bridge_runtime'],
    preservesEvidenceRows: true,
    postCommitZeroSessionProof: true,
    requiresExistingOperatorAuthority: ['CREATEROLE','pg_read_all_data','pg_read_all_stats'],
    requiredBeforeCredentialProvisioning: true,
    maximumCredentialWindowMinutes: 60,
    activationPhases: ['deploy_edge_disabled','stage_secrets_flags_disabled','install_generation_6_once','verify_restricted_connections','verify_provider_readback','deploy_immutable_preview_disabled','enable_database_controls','enable_edge_then_server_then_public','run_one_no-purchase_journey','retire_generation_6'],
    recoveryTriggers: ['uncertain_database_acknowledgement','partial_credentials_or_mixed_markers','unexpected_membership_or_acl','cross_role_denial_failure','control_state_mismatch','provider_readback_mismatch','immutable_deployment_mismatch','premature_route_availability','runtime_session_not_closed','window_expired','activation_interrupted'],
  },
  gates: [
    'verify_exact_target_and_production_exclusion', 'run_one_pinned_authenticated_read_only_preflight',
    'verify_hosted_002_through_011_and_all_controls_disabled',
    'verify_pins_operator_authority_and_actual_pg_acceptance', 'record_exclusive_nonsecret_dispatch_intent',
    'install_012_through_016_in_one_disabled_window', 'reconcile_any_uncertain_install_read_only_without_retry',
    'verify_roles_rls_acls_function_sources_and_empty_new_stores', 'verify_post_016_recovery_package_before_credentials',
    'deploy_edge_disabled_and_verify_fixed_503',
    'install_distinct_runtime_credentials_and_secret_configuration', 'verify_provider_endpoints_callbacks_permissions_and_logout_uri',
    'deploy_immutable_preview_with_public_feature_flags_disabled', 'run_unavailable_route_and_cross_role_denial_checks',
    'enable_database_controls_then_edge_then_server_feature_flags', 'run_one_authenticated_account_orders_logout_journey',
    'retire_temporary_operator_access_and_preserve_postflight_evidence', 'run_pinned_recovery_on_failed_or_uncertain_activation',
  ],
}
const serialized = JSON.stringify(manifest, null, 2) + '\n'
if (process.argv.includes('--check')) {
  let current = ''
  try { current = await readFile(output, 'utf8') } catch { /* mismatch below */ }
  if (current !== serialized) { console.error('staging account activation manifest is stale'); process.exitCode = 1 }
} else await writeFile(output, serialized, { mode: 0o644 })
