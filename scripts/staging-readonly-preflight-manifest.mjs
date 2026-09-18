import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ENDPOINT, FIXED_QUERY, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, MAX_AGE_MS, PROJECT_REF, PRODUCTION_PROJECT_REF, QUERY_ID } from './staging-readonly-preflight.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(root, 'config/staging-readonly-preflight-manifest.json')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const pin = async path => ({ path, sha256: sha256(await readFile(resolve(root, path))) })

const manifest = {
  schema: 'tll-staging-readonly-preflight/v2', target: PROJECT_REF, productionExcluded: PRODUCTION_PROJECT_REF,
  nativeAccessApproved: false, query: { id: QUERY_ID, sha256: sha256(FIXED_QUERY), beginsReadOnly: true },
  sourcePins: await Promise.all(['scripts/staging-readonly-preflight.mjs', 'scripts/staging-readonly-preflight-keychain.py'].map(pin)),
  keychain: { service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNT, reviewedDesignPath: '../../implementation-state/staging/generation-launcher-2026-09-18/native_adapter.py', reviewedDesignSha256: '835cc3394a3f01e18df91d2e111d384aa48592f10e8a239c603b59cd56627bed' },
  transport: { ...ENDPOINT, redirects: false, maxAgeMs: MAX_AGE_MS, maxRequests: 1 },
  output: ['target', 'queryId', 'timestamp', 'status', 'counts', 'receiptHash'],
}
const serialized = JSON.stringify(manifest, null, 2) + '\n'
if (process.argv.includes('--check')) {
  let current = ''
  try { current = await readFile(output, 'utf8') } catch { /* mismatch below */ }
  if (current !== serialized) { console.error('staging read-only preflight manifest is stale'); process.exitCode = 1 }
} else await writeFile(output, serialized, { mode: 0o644 })
