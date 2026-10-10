/** Separate historical-byte proof. Reads/hashes source only; never executes it or grants authority. */
import { fileURLToPath } from 'node:url'
import { nativeDesignReference } from './staging-readonly-preflight.mjs'
export const HISTORICAL_DESIGN_PATH = '../../implementation-state/staging/generation-launcher-2026-09-18/native_adapter.py'
export const HISTORICAL_DESIGN_SHA256 = '835cc3394a3f01e18df91d2e111d384aa48592f10e8a239c603b59cd56627bed'
export function qualifyHistoricalDesign () {
  const base = { path: HISTORICAL_DESIGN_PATH, expectedSha256: HISTORICAL_DESIGN_SHA256, authorization: 'NONE', runtimeDependency: false }
  let reference
  try { reference = nativeDesignReference() } catch (error) {
    return Object.freeze({ ...base, status: 'BLOCKED_HISTORICAL_PROVENANCE', evidenceStatus: 'UNVERIFIED', reason: error?.code === 'ENOENT' ? 'MISSING_ARTIFACT' : 'UNREADABLE_ARTIFACT' })
  }
  if (reference.path !== HISTORICAL_DESIGN_PATH || reference.sha256 !== HISTORICAL_DESIGN_SHA256 || reference.service !== 'Supabase CLI' || reference.account !== 'supabase') {
    return Object.freeze({ ...base, status: 'BLOCKED_HISTORICAL_PROVENANCE', evidenceStatus: 'UNVERIFIED', reason: 'ARTIFACT_MISMATCH' })
  }
  return Object.freeze({ ...base, status: 'VERIFIED_HISTORICAL_DESIGN', evidenceStatus: 'VERIFIED' })
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 2) process.exitCode = 1
  else {
    const result = qualifyHistoricalDesign()
    process.stdout.write(JSON.stringify(result) + '\n')
    if (result.evidenceStatus !== 'VERIFIED') process.exitCode = 1
  }
}
