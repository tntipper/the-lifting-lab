/** Value-free selection of the five existing branch-only Vercel password rows. */
import { HOSTED_BASELINE_VERCEL_TARGET } from './staging-account-hosted-baseline-vercel.mjs'
import { VERCEL_PASSWORD_NAMES } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = false
const ID = /^[A-Za-z0-9_-]{4,128}$/
const unavailable = () => { throw new Error('Generation 23 Vercel targets unavailable') }
const preview = value => value === 'preview'
  || (Array.isArray(value) && value.length === 1 && value[0] === 'preview')

/** `raw` is a fixed-project list response; values are never copied or returned. */
export function selectStagingGeneration23VercelPasswordTargets(raw) {
  if (!STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED || !raw || typeof raw !== 'object'
    || Array.isArray(raw) || !Array.isArray(raw.envs) || raw.envs.length >= 100) unavailable()
  if (Object.hasOwn(raw, 'pagination') && (!raw.pagination || typeof raw.pagination !== 'object'
    || Array.isArray(raw.pagination) || raw.pagination.next !== null)) unavailable()
  const selected = new Map(), seenIds = new Set()
  for (const item of raw.envs) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || typeof item.key !== 'string') unavailable()
    if (!VERCEL_PASSWORD_NAMES.includes(item.key)) continue
    if (!ID.test(item.id) || !preview(item.target)
      || item.gitBranch !== HOSTED_BASELINE_VERCEL_TARGET.branch
      || item.type !== 'sensitive' || item.visibility !== 'secret'
      || selected.has(item.key) || seenIds.has(item.id)) unavailable()
    selected.set(item.key, Object.freeze({ name: item.key, id: item.id,
      branch: HOSTED_BASELINE_VERCEL_TARGET.branch, target: 'preview',
      classification: 'sensitive' }))
    seenIds.add(item.id)
  }
  if (selected.size !== VERCEL_PASSWORD_NAMES.length) unavailable()
  return Object.freeze(VERCEL_PASSWORD_NAMES.map(name => selected.get(name)))
}

/** PATCH metadata must preserve the already-secret exact branch row and ID. */
export function validateStagingGeneration23VercelPatchReceipt(payload, selected) {
  if (!STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED || !selected
    || typeof selected !== 'object' || Array.isArray(selected)
    || !VERCEL_PASSWORD_NAMES.includes(selected.name) || !ID.test(selected.id)
    || selected.branch !== HOSTED_BASELINE_VERCEL_TARGET.branch
    || selected.target !== 'preview' || selected.classification !== 'sensitive'
    || !payload || typeof payload !== 'object' || Array.isArray(payload)
    || payload.key !== selected.name || payload.id !== selected.id
    || !preview(payload.target) || payload.gitBranch !== selected.branch
    || payload.type !== 'sensitive' || payload.visibility !== 'secret') unavailable()
  return Object.freeze({ status: 'REPLACED', name: selected.name, id: selected.id,
    branch: selected.branch, target: 'preview', classification: 'sensitive' })
}
