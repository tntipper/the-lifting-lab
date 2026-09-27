/**
 * Concrete, still-disabled dependencies for the staging provider adapter.
 *
 * This module deliberately receives every effectful primitive from its caller.
 * It has no process runner, credential discovery, environment access, or live
 * entry point. A later, separately reviewed executor can inject bounded
 * runners and fetch without widening this module's authority.
 */
import { createClient } from '@supabase/supabase-js'
import {
  BROKER_SECRET_NAME,
  PROVIDER_IDENTIFIER,
  STAGING_PROJECT_REF,
  STAGING_PROVIDER_TARGET,
} from './staging-provider-broker-rotation.mjs'
import {
  createStagingProviderBrokerNativeAdapter,
  STAGING_AUTH_URL,
} from './staging-provider-broker-native-adapter.mjs'

export const NATIVE_STAGING_PROVIDER_BROKER_BINDING_ENABLED = false
export const STAGING_PROVIDER_ROOT_URL = `https://${STAGING_PROJECT_REF}.supabase.co`

const unavailable = () => { throw new Error('Staging provider native binding unavailable') }
const exactKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')
const VERCEL_BASE = Object.freeze(['--project', STAGING_PROVIDER_TARGET.vercelProject, '--scope', STAGING_PROVIDER_TARGET.vercelScope, '--non-interactive', '--no-color'])
const VERCEL_BRANCH = STAGING_PROVIDER_TARGET.branch
// GoTrue retains the colon in this path segment. This is intentionally the
// literal identifier rather than a generic caller-supplied URL.
const PROVIDER_PATH = `/auth/v1/admin/custom-providers/${PROVIDER_IDENTIFIER}`
const PROVIDER_URL = `${STAGING_PROVIDER_ROOT_URL}${PROVIDER_PATH}`

function validateTarget(value) {
  if (!exactKeys(value, Object.keys(STAGING_PROVIDER_TARGET))) unavailable()
  for (const [key, expected] of Object.entries(STAGING_PROVIDER_TARGET)) if (value[key] !== expected) unavailable()
  return STAGING_PROVIDER_TARGET
}

function signalLike(signal) {
  return signal && typeof signal.aborted === 'boolean' && typeof signal.addEventListener === 'function'
}

function copyBuffer(value, minimum = 1, maximum = 24_576) {
  if (!Buffer.isBuffer(value) || value.length < minimum || value.length > maximum) unavailable()
  return Buffer.from(value)
}

function isSafeName(value) {
  return typeof value === 'string' && /^[A-Z][A-Z0-9_]{0,255}$/.test(value)
}

function parseJson(raw) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) unavailable()
  const bytes = Buffer.isBuffer(raw) ? Buffer.from(raw) : Buffer.from(raw, 'utf8')
  if (bytes.length > 1_048_576) { bytes.fill(0); unavailable() }
  try { return JSON.parse(bytes.toString('utf8')) } catch { unavailable() } finally { bytes.fill(0) }
}

function responseIsFixed(response) {
  if (!response || typeof response !== 'object' || response.redirected === true) unavailable()
  if (typeof response.url === 'string' && response.url !== '' && response.url !== PROVIDER_URL) unavailable()
  return response
}

function mergeSignal(fixedSignal, suppliedSignal) {
  if (!signalLike(fixedSignal) || fixedSignal.aborted || (suppliedSignal !== undefined && !signalLike(suppliedSignal))) unavailable()
  if (!suppliedSignal || suppliedSignal === fixedSignal) return fixedSignal
  const controller = new AbortController()
  const abort = () => controller.abort()
  fixedSignal.addEventListener('abort', abort, { once: true })
  suppliedSignal.addEventListener('abort', abort, { once: true })
  if (fixedSignal.aborted || suppliedSignal.aborted) controller.abort()
  return controller.signal
}

/** Construct the official SDK at the project root; it appends `/auth/v1`. */
export function createOfficialStagingProviderClient({ target, authUrl, projectSecret, signal, fetcher } = {}) {
  validateTarget(target)
  if (authUrl !== STAGING_AUTH_URL || STAGING_AUTH_URL !== STAGING_PROVIDER_ROOT_URL || typeof fetcher !== 'function' || !signalLike(signal) || signal.aborted) unavailable()
  const secret = copyBuffer(projectSecret)
  let serviceKey
  try {
    serviceKey = secret.toString('utf8')
    if (serviceKey.length < 1 || /[\x00-\x1f\x7f]/.test(serviceKey)) unavailable()
    return createClient(STAGING_PROVIDER_ROOT_URL, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: async (input, init = {}) => {
          const url = String(input)
          if (url !== PROVIDER_URL || !init || typeof init !== 'object') unavailable()
          const forwarded = { ...init, redirect: 'error', signal: mergeSignal(signal, init.signal) }
          let response
          try { response = await fetcher(url, forwarded) } catch { unavailable() }
          return responseIsFixed(response)
        },
      },
    })
  } catch { unavailable() } finally { secret.fill(0) }
}

function dotenvSecret(material) {
  const secret = copyBuffer(material, 32, 512)
  try {
    const text = secret.toString('utf8')
    if (/[^\x20-\x7e]/.test(text)) unavailable()
    return Buffer.from(`${BROKER_SECRET_NAME}=${JSON.stringify(text)}\n`, 'utf8')
  } finally { secret.fill(0) }
}

async function run(runOperation, args, input, inputFd, signal) {
  if (typeof runOperation !== 'function' || !Array.isArray(args) || args.some(value => typeof value !== 'string') || !Buffer.isBuffer(input) || ![0, 3].includes(inputFd) || !signalLike(signal) || signal.aborted) unavailable()
  try { return await runOperation(Object.freeze([...args]), input, inputFd, { signal }) } catch { unavailable() }
}

function supabaseStageArgs() {
  return Object.freeze(['secrets', 'set', '--env-file', '/dev/fd/3', '--project-ref', STAGING_PROJECT_REF, '--output', 'json'])
}
function supabaseListArgs() {
  return Object.freeze(['secrets', 'list', '--project-ref', STAGING_PROJECT_REF, '--output', 'json'])
}
function supabaseRemoveArgs() {
  return Object.freeze(['secrets', 'unset', BROKER_SECRET_NAME, '--project-ref', STAGING_PROJECT_REF, '--output', 'json'])
}
function vercelStageArgs() {
  return Object.freeze(['--yes', 'vercel', 'env', 'add', BROKER_SECRET_NAME, 'preview', '--git-branch', VERCEL_BRANCH, ...VERCEL_BASE, '--sensitive', '--force'])
}
function vercelListArgs() {
  return Object.freeze(['--yes', 'vercel', 'env', 'ls', 'preview', VERCEL_BRANCH, ...VERCEL_BASE, '--json'])
}
function vercelRemoveArgs() {
  return Object.freeze(['--yes', 'vercel', 'env', 'rm', BROKER_SECRET_NAME, 'preview', VERCEL_BRANCH, ...VERCEL_BASE, '--yes'])
}

function parseSupabaseNames(raw) {
  const values = parseJson(raw)
  if (!Array.isArray(values) || values.length > 4_096) unavailable()
  const names = values.map(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value) || !isSafeName(value.name)) unavailable()
    return value.name
  })
  if (new Set(names).size !== names.length) unavailable()
  return Object.freeze(names.filter(name => name === BROKER_SECRET_NAME))
}

function parseVercelNames(raw) {
  const value = parseJson(raw)
  if (!value || typeof value !== 'object' || Array.isArray(value) || !Array.isArray(value.envs) || value.envs.length > 4_096) unavailable()
  const names = []
  for (const item of value.envs) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !isSafeName(item.key) || typeof item.gitBranch !== 'string' || !Array.isArray(item.target)
      || item.target.some(target => typeof target !== 'string')) unavailable()
    if (item.gitBranch === VERCEL_BRANCH && item.target.length === 1 && item.target[0] === 'preview') names.push(item.key)
  }
  if (new Set(names).size !== names.length) unavailable()
  return Object.freeze(names.filter(name => name === BROKER_SECRET_NAME))
}

function createSecretHost({ target, runOperation, kind }) {
  validateTarget(target)
  if (typeof runOperation !== 'function' || !['supabase', 'vercel'].includes(kind)) unavailable()
  const args = kind === 'supabase'
    ? { stage: supabaseStageArgs, list: supabaseListArgs, remove: supabaseRemoveArgs, fd: 3, parse: parseSupabaseNames }
    : { stage: vercelStageArgs, list: vercelListArgs, remove: vercelRemoveArgs, fd: 0, parse: parseVercelNames }
  return Object.freeze({
    stage: async (callerTarget, name, material, { signal } = {}) => {
      validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable()
      const input = kind === 'supabase' ? dotenvSecret(material) : copyBuffer(material, 32, 512)
      try { await run(runOperation, args.stage(), input, args.fd, signal) } finally { input.fill(0) }
      return Object.freeze({ status: 'STAGED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    remove: async (callerTarget, name, { signal } = {}) => {
      validateTarget(callerTarget); if (name !== BROKER_SECRET_NAME) unavailable()
      const input = Buffer.alloc(0)
      try { await run(runOperation, args.remove(), input, 0, signal) } finally { input.fill(0) }
      return Object.freeze({ status: 'REMOVED', target: STAGING_PROVIDER_TARGET, name: BROKER_SECRET_NAME })
    },
    readNames: async (callerTarget, { signal } = {}) => {
      validateTarget(callerTarget)
      const input = Buffer.alloc(0)
      let raw
      try { raw = await run(runOperation, args.list(), input, 0, signal) } finally { input.fill(0) }
      return args.parse(raw)
    },
  })
}

/**
 * Bind the adapter to fixed official SDK and closed Vercel/Supabase CLI ports.
 * `execute`, `fetcher` and runners must be supplied by the bounded executor.
 */
export function createStagingProviderBrokerNativeBinding({ target = STAGING_PROVIDER_TARGET, projectSecret, readFrozenState,
  execute, fetcher, runVercel, runSupabase } = {}) {
  validateTarget(target)
  if (!Buffer.isBuffer(projectSecret) || typeof readFrozenState !== 'function' || typeof execute !== 'function'
    || typeof fetcher !== 'function' || typeof runVercel !== 'function' || typeof runSupabase !== 'function') unavailable()
  return createStagingProviderBrokerNativeAdapter({
    target: STAGING_PROVIDER_TARGET,
    projectSecret,
    execute,
    readFrozenState,
    createProviderClient: input => createOfficialStagingProviderClient({ ...input, fetcher }),
    supabase: createSecretHost({ target: STAGING_PROVIDER_TARGET, runOperation: runSupabase, kind: 'supabase' }),
    vercel: createSecretHost({ target: STAGING_PROVIDER_TARGET, runOperation: runVercel, kind: 'vercel' }),
  })
}
