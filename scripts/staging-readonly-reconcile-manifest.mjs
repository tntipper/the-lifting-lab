import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { ENDPOINT, FIXED_QUERY, KEYCHAIN_ACCOUNT, KEYCHAIN_SERVICE, MAX_AGE_MS, NATIVE_ACCESS_APPROVED, NATIVE_HELPER_TIMEOUT_MS, PRIOR_ATTEMPT, PROJECT_REF, PRODUCTION_PROJECT_REF, QUERY_ID } from './staging-readonly-reconcile.mjs'

const root = resolve(fileURLToPath(new URL('..', import.meta.url)))
const output = resolve(root, 'config/staging-readonly-reconcile-manifest.json')
const sha256 = value => createHash('sha256').update(value).digest('hex')
const sourcePins = await Promise.all(['scripts/staging-readonly-reconcile.mjs', 'scripts/staging-readonly-reconcile-keychain.py'].map(async path => ({ path, sha256: sha256(await readFile(resolve(root, path))) })))
const helper = await readFile(resolve(root, 'scripts/staging-readonly-reconcile-keychain.py'), 'utf8')
const approval = /^APPROVED_NATIVE_READ = (True|False)$/m.exec(helper)?.[1]
if (approval === undefined || (approval === 'True') !== NATIVE_ACCESS_APPROVED) throw Error('native access flags disagree')
const manifest = { schema: 'tll-staging-readonly-reconcile/v1', target: PROJECT_REF, productionExcluded: PRODUCTION_PROJECT_REF, priorAttempt: PRIOR_ATTEMPT, nativeAccessApproved: NATIVE_ACCESS_APPROVED, query: { id: QUERY_ID, sha256: sha256(FIXED_QUERY), statementCount: 1, observationOnly: true, applicationSecurityDefinerFunctions: false }, sourcePins, keychain: { service: KEYCHAIN_SERVICE, account: KEYCHAIN_ACCOUNT }, transport: { ...ENDPOINT, redirects: false, maxAgeMs: MAX_AGE_MS, nativeHelperTimeoutMs: NATIVE_HELPER_TIMEOUT_MS, maxRequests: 1, maxResponseBytes: 16384 }, journal: { path: '../implementation-state/staging/tll-staging-readonly-reconcile-observation.json', exclusive: true }, output: ['status', 'target', 'queryId', 'priorAttempt', 'observed', 'differences', 'observationHash'] }
const serialized = JSON.stringify(manifest, null, 2) + '\n'
if (process.argv.includes('--check')) { let current=''; try { current=await readFile(output, 'utf8') } catch {} if (current !== serialized) { console.error('staging read-only reconciliation manifest is stale'); process.exitCode=1 } } else await writeFile(output, serialized, { mode: 0o644 })
