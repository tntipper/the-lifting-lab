/** Disabled, fixed-target Supabase query transport for the reviewed Gen23 final read-only transaction. */
import https from 'node:https'
import { buildStagingGeneration23FinalCheckSql,
  validateStagingGeneration23FinalCheck } from './staging-generation-23-final-check.mjs'
import { PROJECT_REF } from './staging-generation-23-password-material.mjs'

export const STAGING_GENERATION_23_FINAL_QUERY_ENABLED = true
export const ENDPOINT = Object.freeze({ hostname: 'api.supabase.com',
  path: `/v1/projects/${PROJECT_REF}/database/query`, method: 'POST' })
const MAX_RESPONSE_BYTES = 65_536
const unavailable = () => { throw new Error('Generation 23 final query unavailable') }

/** The caller owns `token`; this function does not log or persist it or the SQL. */
export async function postStagingGeneration23FinalCheck({ token, signal, request = https.request } = {}) {
  if (!STAGING_GENERATION_23_FINAL_QUERY_ENABLED || typeof request !== 'function'
    || !Buffer.isBuffer(token) || token.length < 16 || token.length > 512
    || !/^sbp_(?:oauth_|v0_)?[a-f0-9]{40}$/.test(token.toString('utf8'))
    || !signal || signal.aborted || typeof signal.addEventListener !== 'function') unavailable()
  const sql = buildStagingGeneration23FinalCheckSql()
  if (sql.length > 100_000) unavailable()
  // Supabase's API read_only mode changes the database role. The SQL transaction itself is read-only.
  const body = Buffer.from(JSON.stringify({ query: sql, read_only: false }))
  const chunks = []
  let req, response, timer, settled = false, size = 0
  try {
    return await new Promise((resolve, reject) => {
      const finish = (error, rows) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (error) reject(new Error('Generation 23 final query unavailable'))
        else resolve(rows)
      }
      const onAbort = () => {
        try { req?.destroy() } catch {}
        try { response?.destroy() } catch {}
        finish(true)
      }
      signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(onAbort, 30_000)
      if (signal.aborted) { onAbort(); return }
      try {
        req = request({ protocol: 'https:', hostname: ENDPOINT.hostname, port: 443,
          path: ENDPOINT.path, method: ENDPOINT.method, minVersion: 'TLSv1.2',
          rejectUnauthorized: true, servername: ENDPOINT.hostname, agent: false,
          headers: { Authorization: `Bearer ${token.toString('utf8')}`, 'Content-Type': 'application/json',
            'Content-Length': body.length, Accept: 'application/json', 'Accept-Encoding': 'identity' } }, res => {
          response = res
          if (settled || signal.aborted) { try { res.destroy() } catch {}; return }
          const length = res.headers?.['content-length']
          const encoding = res.headers?.['content-encoding']
          if (res.statusCode !== 201 || !/^application\/json(?:;|$)/i.test(String(res.headers?.['content-type'] ?? ''))
            || (length != null && (!/^\d+$/.test(String(length)) || Number(length) > MAX_RESPONSE_BYTES))
            || (encoding != null && encoding !== 'identity')) { onAbort(); return }
          res.on('error', onAbort); res.on('aborted', onAbort)
          res.on('data', chunk => {
            if (settled || !Buffer.isBuffer(chunk) || size + chunk.length > MAX_RESPONSE_BYTES) {
              if (Buffer.isBuffer(chunk)) chunk.fill(0)
              onAbort(); return
            }
            size += chunk.length; chunks.push(Buffer.from(chunk)); chunk.fill(0)
          })
          res.on('end', () => {
            if (settled) return
            const output = Buffer.concat(chunks, size)
            try {
              const rows = JSON.parse(output.toString('utf8'))
              if (!Array.isArray(rows) || rows.length !== 1) unavailable()
              validateStagingGeneration23FinalCheck(rows)
              finish(null, rows)
            } catch { onAbort() }
            finally { output.fill(0) }
          })
        })
        req.on('error', onAbort)
        req.end(body)
      } catch { onAbort() }
    })
  } finally {
    body.fill(0)
    for (const chunk of chunks) chunk.fill(0)
  }
}
