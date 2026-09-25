/** Disabled two-selector credential collection inside a supervised worker. */
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

export const STAGING_PREVIEW_DEPLOYMENT_CREDENTIALS_ENABLED = false
export const STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER = resolve(import.meta.dirname, 'staging-surface-preview-deployment-keychain.py')
const PYTHON = '/usr/bin/python3'
const unavailable = () => { throw new Error('Staging Preview deployment credentials unavailable') }
const valid = value => Buffer.isBuffer(value) && value.length >= 8 && value.length <= 4096
  && !value.includes(0) && /^[\x21-\x7e]+$/.test(value.toString('utf8'))

/** Each child is bounded independently; the parent worker has a separate hard deadline. */
export function readStagingPreviewDeploymentCredentials({ runChild = spawnSync } = {}) {
  if (typeof runChild !== 'function') unavailable()
  const owned = {}
  try {
    for (const [name, selector] of [['vercelToken', 'vercel'], ['protectionBypassToken', 'vercel-bypass']]) {
      const result = runChild(PYTHON, ['-I', '-S', STAGING_PREVIEW_DEPLOYMENT_KEYCHAIN_HELPER, selector], {
        env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' }, stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000, maxBuffer: 4097,
      })
      const output = Buffer.isBuffer(result?.stdout) ? result.stdout : Buffer.alloc(0)
      try {
        if (result?.status !== 0 || !valid(output)) unavailable()
        owned[name] = Buffer.from(output)
      } finally { output.fill(0) }
    }
    return owned
  } catch {
    for (const value of Object.values(owned)) value.fill(0)
    unavailable()
  }
}
