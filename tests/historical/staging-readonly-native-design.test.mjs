// Dedicated historical provenance proof: not part of portable application regression.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { nativeDesignReference, PROJECT_REF, QUERY_ID } from '../../scripts/staging-readonly-preflight.mjs'

test('reviewed native Keychain design is hash-pinned without enabling it', () => {
  const reference = nativeDesignReference()
  execFileSync(process.execPath, ['scripts/staging-readonly-preflight-manifest.mjs', '--check'], { stdio: 'pipe' })
  const manifest = JSON.parse(readFileSync('config/staging-readonly-preflight-manifest.json', 'utf8'))
  assert.equal(reference.service, 'Supabase CLI'); assert.equal(reference.account, 'supabase')
  assert.match(reference.sha256, /^[a-f0-9]{64}$/)
  assert.equal(manifest.nativeAccessApproved, false)
  assert.equal(manifest.target, PROJECT_REF)
  assert.equal(manifest.schema, 'tll-staging-readonly-preflight/v5')
  assert.equal(manifest.keychain.reviewedDesignSha256, reference.sha256)
  assert.equal(manifest.transport.maxRequests, 1)
  assert.equal(manifest.query.id, QUERY_ID)
  assert.equal(manifest.query.assertionsInReadOnlyTransaction, true)
  assert.equal(manifest.query.finalStatementLiteralReceipt, true)
  assert.match(manifest.query.sha256, /^[a-f0-9]{64}$/)
  assert.deepEqual(manifest.sourcePins.map(pin => pin.path), ['scripts/staging-readonly-preflight.mjs', 'scripts/staging-readonly-preflight-keychain.py'])
  assert.match(readFileSync('scripts/staging-readonly-preflight-manifest.mjs', 'utf8'), /native access flags disagree/)
})

