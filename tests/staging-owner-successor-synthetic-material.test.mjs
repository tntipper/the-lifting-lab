import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { prepareSyntheticSuccessorWindow } from '../scripts/staging-owner-successor-window-binding.mjs'
import { prepareSyntheticSuccessorSetup, consumeSyntheticSuccessorSetup } from '../scripts/staging-owner-successor-synthetic-material.mjs'
import { freshWindowInput } from './fixtures/owner-successor-fresh-window.mjs'
test('deterministic mock setup SQL binds fresh window, preserves guards and unconditionally aborts before mutation', () => {
  const input = freshWindowInput(), { capability } = prepareSyntheticSuccessorWindow(input)
  const prepared = prepareSyntheticSuccessorSetup({ capability, observedPins: input.pins, nowMs: input.startedAtMs })
  const { sql, binding, authorization } = consumeSyntheticSuccessorSetup(prepared.packet)
  assert.equal(authorization, 'NONE'); assert.match(sql, /SYNTHETIC_OWNER_SUCCESSOR_NEVER_TRANSPORT/)
  assert.ok(sql.indexOf('SYNTHETIC_OWNER_SUCCESSOR_NEVER_TRANSPORT') < sql.indexOf('GRANT '))
  assert.ok(sql.includes(binding.windowId)); assert.ok(sql.includes(binding.predecessor.windowId))
  assert.ok(sql.includes(binding.predecessor.expiresAt))
  assert.ok(!sql.includes('759bc8ed-5ecd-475c-8a4c-e35fcf628a73'))
  assert.equal((sql.match(/ALTER ROLE tll_[a-z]+_runtime LOGIN PASSWORD /g) || []).length, 5)
  for (const guard of ['operator mismatch', 'operator_project_ref', 'migration', 'private authority', 'membership mismatch', 'control', 'before commit'])
    assert.ok(sql.toLowerCase().includes(guard.toLowerCase()), guard)
  assert.throws(() => consumeSyntheticSuccessorSetup(prepared.packet))
  assert.throws(() => consumeSyntheticSuccessorSetup({}))
  assert.throws(() => prepareSyntheticSuccessorSetup({ capability, observedPins: input.pins, nowMs: input.startedAtMs }))
})
test('the synthetic SQL body preserves every historical guard and adds effective statistics privileges', () => {
  const original = readFileSync(new URL('../scripts/staging-generation-23-credentials.mjs', import.meta.url), 'utf8')
  const successor = readFileSync(new URL('../scripts/staging-owner-successor-synthetic-material.mjs', import.meta.url), 'utf8')
  const guards = source => source.slice(source.indexOf('SET LOCAL lock_timeout'), source.indexOf('/** Issue one opaque') < 0
    ? source.indexOf('/** No caller') : source.indexOf('/** Issue one opaque')).trim()
  const expected = guards(original).replace("  OR NOT pg_has_role(operator_name,'pg_read_all_stats','MEMBER') THEN",
    "  OR NOT pg_has_role(operator_name,'pg_read_all_stats','MEMBER')\n  OR NOT pg_has_role(operator_name,'pg_read_all_stats','USAGE') THEN")
  assert.ok(expected.includes("pg_read_all_stats','USAGE'"))
  assert.equal(guards(successor), expected)
})
