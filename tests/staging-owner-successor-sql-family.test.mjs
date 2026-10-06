import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspectStagingLiveBoundary } from '../scripts/staging-live-boundary-check.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { OWNER_SUCCESSOR_WINDOW_ID } from '../scripts/staging-owner-successor-registration.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const start = Date.parse('2030-01-01T12:00:00.000Z'), expiresAt = '2030-01-01T12:45:00.000Z'
const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
  deriveScramVerifier(`synthetic-${index}`.repeat(8), Buffer.alloc(18, index + 1))]))
const configurations = [
  ['credentials', 'credentials', 'CREDENTIALS', 'CredentialSql', 'CredentialReceipt', 'credential_receipt', 'packageId', 'PASS'],
  ['shutdown', 'control-shutdown', 'CONTROL_SHUTDOWN', 'ControlShutdownSql', 'ControlShutdownReceipt', 'control_shutdown', 'shutdownId', 'PASS_CONTROLS_DISABLED'],
  ['backend-state', 'backend-state', 'BACKEND_STATE', 'BackendStateSql', 'BackendState', 'backend_state', 'queryId', 'PASS_BACKEND_OFF'],
  ['retirement', 'recovery', 'RECOVERY', 'RecoverySql', 'RecoveryReceipt', 'recovery_receipt', 'recoveryId', 'PASS_RETIRED'],
  ['final-check', 'final-check', 'FINAL_CHECK', 'FinalCheckSql', 'FinalCheck', 'final_check', 'queryId', 'PASS_FINAL_RETIRED'],
]
const encode = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
const absolute = source => source.replaceAll("from './", `from '${scripts.href}`)
async function context(expiry = expiresAt, started = new Date(start).toISOString()) {
  const source = (await readFile(new URL('staging-owner-successor-sql-context.mjs', scripts), 'utf8'))
    .replace("export const ACTIVE_WINDOW_STARTED_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_STARTED_AT = '${started}'`)
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'", `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiry}'`)
  return encode(absolute(source))
}
async function armed(config, contextUrl) {
  const [name, , gate] = config
  const declaration = `export const OWNER_SUCCESSOR_NATIVE_SQL_${gate}_ENABLED = false`
  let source = await readFile(new URL(`staging-owner-successor-sql-${name}.mjs`, scripts), 'utf8')
  assert.equal(source.split(declaration).length, 2)
  source = source.replace(declaration, declaration.replace('false', 'true'))
    .replaceAll("from './staging-owner-successor-sql-context.mjs'", `from '${contextUrl}'`)
  return import(encode(absolute(source)))
}
const input = () => ({ expiresAt, verifiers, nowMs: start })
for (const config of configurations) {
  const [name, original, gate, builder, validator, column, idKey, status] = config
  test(`${name}: ordinary source is OFF and cannot build SQL or validate receipts`, async () => {
    const api = await import(new URL(`staging-owner-successor-sql-${name}.mjs`, scripts))
    assert.equal(api[`OWNER_SUCCESSOR_NATIVE_SQL_${gate}_ENABLED`], false)
    assert.throws(() => api[`buildOwnerSuccessor${builder}`](input()), /unavailable/)
    assert.throws(() => api[`validateOwnerSuccessor${validator}`]([], input()), /unavailable/)
  })
  test(`${name}: fresh-window port preserves every original guard and requires effective statistics privileges`, async () => {
    const oldSource = await readFile(new URL(`staging-generation-23-${original}.mjs`, scripts), 'utf8')
    const newSource = await readFile(new URL(`staging-owner-successor-sql-${name}.mjs`, scripts), 'utf8')
    const guardBody = source => source.slice(source.indexOf('SET LOCAL lock_timeout'), source.indexOf('\nSELECT jsonb_build_object'))
    const expected = guardBody(oldSource).replace(/( +)OR NOT pg_has_role\((\w+),'pg_read_all_stats','MEMBER'\) THEN/,
      (_, indent, who) => `${indent}OR NOT pg_has_role(${who},'pg_read_all_stats','MEMBER')\n${indent}OR NOT pg_has_role(${who},'pg_read_all_stats','USAGE') THEN`)
    assert.match(expected, /pg_read_all_stats','USAGE'/)
    assert.equal(guardBody(newSource), expected)
    const api = await armed(config, await context())
    const sql = api[`buildOwnerSuccessor${builder}`](input())
    assert.ok(sql.includes(OWNER_SUCCESSOR_WINDOW_ID))
    assert.ok(sql.includes(expiresAt))
    if (name === 'credentials') {
      assert.equal(api.PREDECESSOR.windowId, 'd5180b08-79ee-43e8-96d4-4f73621fecbf')
      assert.ok(sql.includes(api.PREDECESSOR.expiresAt))
      assert.ok(!sql.includes('759bc8ed-5ecd-475c-8a4c-e35fcf628a73'))
    } else assert.ok(!sql.includes('d5180b08-79ee-43e8-96d4-4f73621fecbf'))
    assert.ok(!sql.includes('UNSET_REQUIRES_REVIEWED_ARMING_DIFF'))
    assert.ok(sql.includes('qdmvngjwkcsilzmqksme') && sql.includes('wrhgscovsgsudtedbljr'))
    assert.match(sql, /operator mismatch|exact.*staging.*operator/)
    assert.match(sql, /migration/)
    if (name === 'final-check' || name === 'backend-state') assert.match(sql, /^BEGIN READ ONLY;/)
    if (name !== 'final-check') assert.throws(() => api[`buildOwnerSuccessor${builder}`]({ ...input(), expiresAt: '2030-01-01T12:44:00.000Z' }), /unavailable/)
  })
  test(`${name}: exact fresh receipt rejects old-window, mixed phase, excess fields and drift`, async () => {
    const api = await armed(config, await context())
    const id = api[idKey === 'packageId' ? 'PACKAGE_ID' : idKey === 'shutdownId' ? 'SHUTDOWN_ID' : idKey === 'recoveryId' ? 'RECOVERY_ID' : 'QUERY_ID']
    const receipt = { status, [idKey]: id, projectRef: 'qdmvngjwkcsilzmqksme', generation: 23,
      windowId: OWNER_SUCCESSOR_WINDOW_ID, expiresAt, controlsEnabled: name === 'shutdown' ? 0 : false,
      ...(name === 'backend-state' ? { runtimeSessions: 0 } : name === 'shutdown' ? {} : { runtimeCount: 5 }),
      ...(name === 'final-check' ? { runtimeSessions: 0 } : {}),
    }
    const validate = value => api[`validateOwnerSuccessor${validator}`]([{ [`tll_owner_successor_${column}`]: value }], input())
    assert.match(validate(receipt).receiptSha256, /^[a-f0-9]{64}$/)
    for (const drift of [{ windowId: 'd5180b08-79ee-43e8-96d4-4f73621fecbf' }, { expiresAt: '2030-01-01T12:44:00.000Z' },
      { projectRef: 'wrhgscovsgsudtedbljr' }, { status: 'WRONG_PHASE' }, { controlsEnabled: true }, { extra: true }]) {
      assert.throws(() => validate({ ...receipt, ...drift }), /unavailable/)
    }
    assert.throws(() => api[`validateOwnerSuccessor${validator}`]([{ [`tll_generation_23_${column}`]: receipt }], input()), /unavailable/)
  })
}
test('fresh setup clock rejects undefined, NaN, infinity, unsafe, pre-window and shutdown-reserve clocks', async () => {
  const api = await armed(configurations[0], await context())
  for (const nowMs of [undefined, NaN, Infinity, -Infinity, null, '2030', {}, .5, Number.MAX_SAFE_INTEGER + 1,
    start - 1, start + 30 * 60_000, start + 45 * 60_000]) {
    const ctx = await import(await context())
    assert.throws(() => ctx.assertOwnerSuccessorSetupClock(expiresAt, nowMs), /unavailable/)
    assert.throws(() => api.buildOwnerSuccessorCredentialSql({ ...input(), nowMs }), /unavailable/)
  }
})
test('fresh context rejects rollover dates, noncanonical timestamps and windows outside45–60minutes', async () => {
  for (const [expiry, started] of [['2030-01-01T12:44:59.000Z', new Date(start).toISOString()],
    ['2030-01-01T13:00:01.000Z', new Date(start).toISOString()], ['2030-02-30T12:45:00.000Z', '2030-02-30T12:00:00.000Z'],
    ['2030-01-01T12:45:00Z', new Date(start).toISOString()]]) {
    const ctx = await import(await context(expiry, started))
    assert.throws(() => ctx.assertOwnerSuccessorSqlWindow(expiry), /unavailable/)
  }
})
test('ordinary boundary rejects missing, duplicated, or enabled successor SQL gates and armed start/expiry', () => {
  const root = mkdtempSync(join(tmpdir(), 'tll-successor-sql-boundary-'))
  for (const name of ['config', 'scripts', 'tests']) mkdirSync(join(root, name))
  writeFileSync(join(root, 'config/project-stage-gate-policy.json'), readFileSync(new URL('../config/project-stage-gate-policy.json', import.meta.url)))
  const path = join(root, 'scripts/staging-owner-successor-sql-credentials.mjs')
  const gate = 'export const OWNER_SUCCESSOR_NATIVE_SQL_CREDENTIALS_ENABLED = false\n'
  for (const source of ['', gate + gate, gate.replace('false', 'true')]) {
    writeFileSync(path, source)
    assert.ok(inspectStagingLiveBoundary({ projectRoot: root }).includes('enabled-native-gate:scripts/staging-owner-successor-sql-credentials.mjs'))
  }
  writeFileSync(path, gate)
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [])
  const contextPath = join(root, 'scripts/staging-owner-successor-sql-context.mjs')
  const disabled = "export const ACTIVE_WINDOW_STARTED_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'\nexport const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'\n"
  writeFileSync(contextPath, disabled)
  assert.deepEqual(inspectStagingLiveBoundary({ projectRoot: root }), [])
  for (const name of ['ACTIVE_WINDOW_STARTED_AT', 'ACTIVE_WINDOW_EXPIRES_AT']) {
    writeFileSync(contextPath, disabled.replace(`export const ${name} = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'`, `export const ${name} = '${expiresAt}'`))
    assert.ok(inspectStagingLiveBoundary({ projectRoot: root }).includes('armed-expiry:scripts/staging-owner-successor-sql-context.mjs'))
  }
})
test('fresh dispatch packets remain opaque, single-use and cannot be consumed across SQL phases', async () => {
  const ctx = await context()
  const setup = await armed(configurations[0], ctx), shutdown = await armed(configurations[1], ctx)
  const retirement = await armed(configurations[3], ctx)
  const packet = setup.prepareOwnerSuccessorCredentialSql(input())
  assert.deepEqual(Object.keys(packet), [])
  assert.throws(() => shutdown.consumeOwnerSuccessorPreparedShutdownSql(packet), /unavailable/)
  assert.throws(() => retirement.consumeOwnerSuccessorPreparedRecoverySql(packet), /unavailable/)
  assert.throws(() => setup.consumeOwnerSuccessorPreparedSql({ ...packet }), /unavailable/)
  assert.match(setup.consumeOwnerSuccessorPreparedSql(packet), /tll_owner_successor_credential_receipt/)
  assert.throws(() => setup.consumeOwnerSuccessorPreparedSql(packet), /unavailable/)
  const retired = retirement.prepareOwnerSuccessorRecoverySql(input())
  assert.match(retirement.consumeOwnerSuccessorPreparedRecoverySql(retired).sql, /NOLOGIN PASSWORD NULL/)
  assert.throws(() => retirement.consumeOwnerSuccessorPreparedRecoverySql(retired), /unavailable/)
})
