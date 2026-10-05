/** Injected child-process adapter; the live launcher owns the actual spawn. */
import { isAbsolute } from 'node:path'

export const CREDENTIAL_READINESS_PYTHON = '/Users/tobiastipper/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3'
export const CREDENTIAL_READINESS_ENVIRONMENT = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' })
export const CREDENTIAL_READINESS_SELECTORS = Object.freeze(['supabase', 'vercel', 'vercel-bypass'])
const categories = Object.freeze({ 11: 'GUARD', 12: 'TIMEOUT', 13: 'COMMAND', 14: 'FORMAT', 15: 'OUTPUT', 16: 'INTERNAL' })
const held = category => Object.freeze({ status: 'HOLD', category })

export function createCredentialReadinessNative({ spawnChild, root, helper } = {}) {
  if (typeof spawnChild !== 'function' || typeof root !== 'string' || typeof helper !== 'string'
    || !isAbsolute(root) || !isAbsolute(helper)) throw Error('Staging credential readiness native unavailable')
  return selector => {
    if (!CREDENTIAL_READINESS_SELECTORS.includes(selector)) return held('GUARD')
    let result
    try {
      result = spawnChild(CREDENTIAL_READINESS_PYTHON, ['-I', '-S', helper, selector], {
        cwd: root, env: CREDENTIAL_READINESS_ENVIRONMENT,
        stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000, maxBuffer: 4_097,
      })
      if (result?.error?.code === 'ETIMEDOUT') return held('TIMEOUT')
      if (result?.error || result?.signal) return held('INTERNAL')
      if (result?.status !== 0) return held(categories[result?.status] ?? 'INTERNAL')
      if (!Buffer.isBuffer(result.stdout) || result.stdout.length < 8 || result.stdout.length > 4_096
        || result.stdout.includes(0) || [...result.stdout].some(byte => byte < 33 || byte > 126)) return held('FORMAT')
      return { status: 'PASS', value: Buffer.from(result.stdout) }
    } catch { return held('INTERNAL') }
    finally { result?.stdout?.fill?.(0) }
  }
}
