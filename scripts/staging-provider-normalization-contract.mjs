/** Pure, disabled contract for a later one-shot staging provider repair. */
import { isDeepStrictEqual } from 'node:util'
import {
  projectOfficialProviderSchema,
  STAGING_PROVIDER_NAME,
} from './staging-provider-broker-native-adapter.mjs'
import {
  BROKER_CLIENT_ID,
  PROVIDER_IDENTIFIER,
  STAGING_BROKER_PROVIDER,
} from './staging-provider-broker-rotation.mjs'

export const STAGING_PROVIDER_NORMALIZATION_ENABLED = false
const unavailable = () => { throw new Error('Staging provider normalization unavailable') }
const exactArray = (value, expected) => Array.isArray(value) && value.length === expected.length
  && value.every((item, index) => item === expected[index])

function project(value) {
  let provider
  try { provider = projectOfficialProviderSchema(value) } catch { unavailable() }
  if (provider.identifier !== PROVIDER_IDENTIFIER || provider.name !== STAGING_PROVIDER_NAME
    || provider.clientId !== BROKER_CLIENT_ID || !exactArray(provider.acceptableClientIds, [])
    || !exactArray(provider.scopes, STAGING_BROKER_PROVIDER.scopes)
    || !provider.pkce || !provider.emailOptional || provider.attributeMappingPresent
    || provider.authorizationParamsPresent || provider.issuer !== '' || provider.discoveryUrl !== ''
    || provider.skipNonceCheck || provider.discoveryDocumentPresent
    || provider.authorizationUrl !== STAGING_BROKER_PROVIDER.authorizationUrl
    || provider.tokenUrl !== STAGING_BROKER_PROVIDER.tokenUrl
    || provider.userinfoUrl !== STAGING_BROKER_PROVIDER.userinfoUrl) unavailable()
  return provider
}

/** Return only the two fields the official SDK permits us to update. */
export function buildStagingProviderNormalizationPatch(before) {
  const provider = project(before)
  if (provider.enabled !== true || provider.jwksUrl === '') unavailable()
  return Object.freeze({ enabled: false, jwks_uri: '' })
}

/** Validate a separate full readback without returning raw provider values. */
export function verifyStagingProviderNormalization(before, after) {
  buildStagingProviderNormalizationPatch(before)
  const earlier = project(before), current = project(after)
  if (current.enabled !== false || current.jwksUrl !== '' || current.createdAt !== earlier.createdAt
    || Date.parse(current.updatedAt) < Date.parse(earlier.updatedAt)) unavailable()
  // Compare the complete validated SDK response, not just projected fields.
  // Missing optional fields, nested mapping drift and identity changes HOLD.
  const stable = value => Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['enabled', 'jwks_uri', 'updated_at'].includes(key)))
  if (!isDeepStrictEqual(stable(before), stable(after))) unavailable()
  return Object.freeze({ status: 'PROVIDER_NORMALIZED_VERIFIED', identifier: PROVIDER_IDENTIFIER,
    enabled: false, jwksConfigured: false })
}
