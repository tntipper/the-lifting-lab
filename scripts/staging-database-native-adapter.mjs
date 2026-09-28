/**
 * Closed, staging-only Management API adapter for the control-activation
 * state machine.  It intentionally has no executable default: ordinary
 * callers receive NATIVE_ACCESS_DISABLED until a separately reviewed arming
 * change changes the constant below and injects a credential reader/transport.
 */
import { buildStagingControlActivationSql, PROJECT_REF, PRODUCTION_PROJECT_REF, validateControlActivationContext, validateStagingControlActivationReceipt } from './staging-control-activation.mjs'

export { PROJECT_REF, PRODUCTION_PROJECT_REF }
export const NATIVE_STAGING_CONTROL_ADAPTER_ENABLED = false
export const MANAGEMENT_ENDPOINT = Object.freeze({
  hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
})
export const REQUEST_TIMEOUT_MS = 35_000
export const MAX_RESPONSE_BYTES = 65_536

const unavailable = () => { throw new Error('Staging control native adapter unavailable') }
const reconciliation = context => Object.freeze({
  status: 'RECONCILIATION_REQUIRED', target: PROJECT_REF,
  generation: context.generation, windowId: context.windowId,
})
const allowedKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).every(key => keys.includes(key))
const exactKeys = (value, keys) => allowedKeys(value, keys) && Object.keys(value).length === keys.length

/**
 * Copies a Management token supplied only as a Buffer. The caller retains its
 * own buffer; this adapter zeroes its private copy once the one request ends.
 */
function copyManagementToken (value) {
  if (!Buffer.isBuffer(value) || value.length < 8 || value.length > 256) unavailable()
  const copy = Buffer.from(value)
  try {
    const token = copy.toString('utf8')
    if (!/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token)) unavailable()
    return Object.freeze({ token, buffer: copy })
  } catch (error) {
    copy.fill(0)
    throw error
  }
}

const responseFailure = () => new Error('Staging control native adapter unavailable')

/**
 * Posts precisely one closed transaction. This is deliberately not a generic
 * SQL transport: the SQL is generated internally from the supplied context.
 * `request` is injected so tests never open a socket.
 */
export async function executeExactControlActivation ({
  context, token, request, nowMs = Date.now(),
  scheduleTimeout = setTimeout, clearScheduledTimeout = clearTimeout,
} = {}) {
  if (!allowedKeys(arguments[0], ['context', 'token', 'request', 'nowMs', 'scheduleTimeout', 'clearScheduledTimeout'])
    || typeof request !== 'function' || typeof scheduleTimeout !== 'function' || typeof clearScheduledTimeout !== 'function') unavailable()
  if (PROJECT_REF === PRODUCTION_PROJECT_REF) unavailable()
  validateControlActivationContext(context, { nowMs })
  const sql = buildStagingControlActivationSql(context, { nowMs })
  const owned = copyManagementToken(token)
  const body = Buffer.from(JSON.stringify({ query: sql, read_only: false }))
  try {
    const rows = await new Promise((resolve, reject) => {
      let req
      let done = false
      let timer
      let size = 0
      const chunks = []
      const finish = (error, value) => {
        if (done) return
        done = true
        clearScheduledTimeout(timer)
        for (const chunk of chunks) chunk.fill(0)
        if (error) reject(error)
        else resolve(value)
      }
      const fail = () => {
        try { req?.destroy() } catch {}
        finish(responseFailure())
      }
      timer = scheduleTimeout(fail, REQUEST_TIMEOUT_MS)
      try {
        req = request({
          protocol: 'https:', hostname: MANAGEMENT_ENDPOINT.hostname, port: 443,
          path: MANAGEMENT_ENDPOINT.path, method: MANAGEMENT_ENDPOINT.method,
          minVersion: 'TLSv1.2', rejectUnauthorized: true,
          servername: MANAGEMENT_ENDPOINT.hostname, agent: false,
          headers: {
            Authorization: `Bearer ${owned.token}`,
            'Content-Type': 'application/json',
            'Content-Length': body.length,
          },
        }, response => {
          const contentType = /^application\/json(?:;|$)/i.test(String(response?.headers?.['content-type'] ?? ''))
          response.on('error', fail)
          response.on('aborted', fail)
          response.on('data', chunk => {
            if (!Buffer.isBuffer(chunk)) return fail()
            size += chunk.length
            if (size > MAX_RESPONSE_BYTES) {
              chunk.fill(0)
              try { response.destroy() } catch {}
              return fail()
            }
            chunks.push(chunk)
          })
          response.on('end', () => {
            const output = Buffer.concat(chunks)
            try {
              if (response.statusCode !== 201 || !contentType) return finish(responseFailure())
              const parsed = JSON.parse(output.toString('utf8'))
              if (!Array.isArray(parsed)) return finish(responseFailure())
              finish(null, parsed)
            } catch {
              finish(responseFailure())
            } finally {
              output.fill(0)
            }
          })
        })
        if (!req || typeof req.on !== 'function' || typeof req.end !== 'function') return fail()
        req.on('error', fail)
        req.end(body)
      } catch {
        fail()
      }
    })
    return validateStagingControlActivationReceipt(rows, context, { nowMs })
  } finally {
    body.fill(0)
    owned.buffer.fill(0)
  }
}

/**
 * The state-machine-facing native port. It performs no credential access or
 * network activity while the reviewed native gate is false. Once separately
 * armed, any ambiguous acknowledgement becomes reconciliation-required and
 * is never retried here.
 */
export function createStagingControlActivationNativeAdapter ({ readToken, request, now = Date.now } = {}) {
  if (typeof now !== 'function') unavailable()
  return Object.freeze({
    target: PROJECT_REF,
    nativeEnabled: NATIVE_STAGING_CONTROL_ADAPTER_ENABLED,
    async activate (value = {}) {
      if (!exactKeys(value, ['context'])) unavailable()
      const { context } = value
      const nowMs = now()
      const validated = validateControlActivationContext(context, { nowMs })
      if (!NATIVE_STAGING_CONTROL_ADAPTER_ENABLED) {
        return Object.freeze({ status: 'NATIVE_ACCESS_DISABLED', target: PROJECT_REF, generation: validated.generation, windowId: validated.windowId })
      }
      if (typeof readToken !== 'function' || typeof request !== 'function') unavailable()
      let token
      try {
        token = readToken()
        if (!Buffer.isBuffer(token)) unavailable()
        return await executeExactControlActivation({ context, token, request, nowMs })
      } catch {
        return reconciliation(validated)
      } finally {
        if (Buffer.isBuffer(token)) token.fill(0)
      }
    },
  })
}
