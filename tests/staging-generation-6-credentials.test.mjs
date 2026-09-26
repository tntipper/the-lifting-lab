import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildGeneration6CredentialSql, createGeneration6DispatchJournal, IDENTITIES, INERT_VALID_UNTIL, PACKAGE_ID, PROJECT_REF, WINDOW_ID } from '../scripts/staging-generation-6-credentials.mjs'

const NOW = Date.parse('2026-09-20T18:00:00.000Z')
const EXPIRES = '2026-09-20T18:59:00.000Z'
const verifier = index => `SCRAM-SHA-256$4096:${Buffer.from(`salt-${index}`).toString('base64')}$${Buffer.alloc(32, index + 1).toString('base64')}:${Buffer.alloc(32, index + 7).toString('base64')}`
const verifiers = () => Object.fromEntries(Object.keys(IDENTITIES).map((purpose, index) => [purpose, verifier(index)]))

test('generation-6 SQL is one fixed staging transaction with exact identities and disabled postflight', () => {
  const values = verifiers(), sql = buildGeneration6CredentialSql({ expiresAt: EXPIRES, verifiers: values, nowMs: NOW })
  assert.ok(sql.startsWith('BEGIN;\n')); assert.equal((sql.match(/^COMMIT;$/gm) ?? []).length, 1)
  assert.equal((sql.match(/^ALTER ROLE /gm) ?? []).length, 5); assert.equal((sql.match(/^GRANT /gm) ?? []).length, 5)
  assert.match(sql, new RegExp(PROJECT_REF)); assert.doesNotMatch(sql, /wrhgscovsgsudtedbljr[^']*operator_project_ref=/)
  assert.match(sql, new RegExp(WINDOW_ID)); assert.match(sql, /Generation 6 requires disabled controls/)
  assert.ok(sql.includes(`rolvaliduntil IS DISTINCT FROM '${INERT_VALID_UNTIL}'::timestamptz`))
  assert.match(sql, /Generation 6 control changed during install/); assert.match(sql, /runtimeCount',5/)
  for (const [purpose, identity] of Object.entries(IDENTITIES)) {
    assert.match(sql, new RegExp(`GRANT ${identity.membership} TO ${identity.login}`)); assert.ok(sql.includes(values[purpose]))
  }
})

test('expiry, exact verifier set and verifier uniqueness fail closed', () => {
  assert.throws(() => buildGeneration6CredentialSql({ expiresAt: '2026-09-20T19:00:01.000Z', verifiers: verifiers(), nowMs: NOW }), /unavailable/)
  const missing = verifiers(); delete missing.bridge
  assert.throws(() => buildGeneration6CredentialSql({ expiresAt: EXPIRES, verifiers: missing, nowMs: NOW }), /unavailable/)
  const duplicate = verifiers(); duplicate.bridge = duplicate.customer
  assert.throws(() => buildGeneration6CredentialSql({ expiresAt: EXPIRES, verifiers: duplicate, nowMs: NOW }), /unavailable/)
  assert.throws(() => buildGeneration6CredentialSql({ expiresAt: EXPIRES, verifiers: { ...verifiers(), customer: 'plain-password' }, nowMs: NOW }), /unavailable/)
})

test('journal is exclusive, mode 0600, nonsecret and permits one owned terminal transition', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tll-gen6-')), path = join(directory, 'journal.json')
  const journal = createGeneration6DispatchJournal({ path, makeRunId: () => 'reviewed-run-id' })
  const intent = journal.recordIntent({ expiresAt: EXPIRES, nowMs: NOW })
  assert.equal(statSync(path).mode & 0o777, 0o600); assert.equal(journal.read().state, 'INTENT_RECORDED')
  const raw = readFileSync(path, 'utf8'); assert.doesNotMatch(raw, /SCRAM|password|secret|token|verifier|BEGIN;/i)
  assert.match(raw, new RegExp(PACKAGE_ID)); assert.equal(journal.transition(intent, 'RECEIPT_VALIDATED').state, 'RECEIPT_VALIDATED')
  assert.throws(() => journal.recordIntent({ expiresAt: EXPIRES, nowMs: NOW }), /unavailable/)
  assert.throws(() => journal.transition(intent, 'RECONCILIATION_REQUIRED'), /unavailable/)
})
