/** Actual disposable PostgreSQL acceptance; no hosted transport or execution authority. */
import assert from 'node:assert/strict'
import test from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23LocalDatabaseFixture } from './staging-generation-23-database-acceptance.mjs'
import { deriveScramVerifier } from '../scripts/staging-generation-6-transport.mjs'
import { PASSWORD_PURPOSES } from '../scripts/staging-generation-22-material.mjs'
import { OWNER_SUCCESSOR_WINDOW_ID } from '../scripts/staging-owner-successor-registration.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const dockerAbsent = spawnSync('docker', ['--version'], { timeout: 5000, stdio: 'ignore' }).error?.code === 'ENOENT'
const docker = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'], timeout: 30_000, maxBuffer: 1024 * 1024 }).trim()
const encode = text => `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`
const absolute = text => text.replaceAll("from './", `from '${scripts.href}`)

/** Only disposable in-memory test imports receive synthetic gate/window edits. */
async function nativeTestSql(expiresAt) {
  const start = new Date(Date.parse(expiresAt) - 60 * 60_000).toISOString()
  let context = await readFile(new URL('staging-owner-successor-sql-context.mjs', scripts), 'utf8')
  for (const [name, value] of [['ACTIVE_WINDOW_STARTED_AT', start], ['ACTIVE_WINDOW_EXPIRES_AT', expiresAt]]) {
    const before = `export const ${name} = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'`
    assert.equal(context.split(before).length, 2)
    context = context.replace(before, `export const ${name} = '${value}'`)
  }
  const contextUrl = encode(absolute(context)), result = {}
  for (const [name, gate] of [['credentials', 'CREDENTIALS'], ['retirement', 'RECOVERY'], ['final-check', 'FINAL_CHECK']]) {
    let source = await readFile(new URL(`staging-owner-successor-sql-${name}.mjs`, scripts), 'utf8')
    const before = `export const OWNER_SUCCESSOR_NATIVE_SQL_${gate}_ENABLED = false`
    assert.equal(source.split(before).length, 2)
    source = source.replace(before, before.replace('false', 'true'))
      .replaceAll("from './staging-owner-successor-sql-context.mjs'", `from '${contextUrl}'`)
    result[name] = await import(encode(absolute(source)))
  }
  return result
}

test('fresh native SQL installs five restricted SCRAM roles, retires and proves final OFF state',
  { skip: dockerAbsent ? 'Docker binary absent; actual PostgreSQL proof not executed' : false, timeout: 180_000 }, async () => {
    const fixture = await createStagingGeneration23LocalDatabaseFixture({ predecessor: 'OWNER_SUCCESSOR_RETIRED_V18' })
    try {
      const api = await nativeTestSql(fixture.expiresAt)
      const setup = api.credentials.buildOwnerSuccessorCredentialSql({ expiresAt: fixture.expiresAt,
        verifiers: fixture.verifiers, nowMs: Date.now() })
      assert.ok(setup.includes(OWNER_SUCCESSOR_WINDOW_ID))
      assert.equal(api.credentials.PREDECESSOR.windowId, 'd5180b08-79ee-43e8-96d4-4f73621fecbf')
      assert.ok(!setup.includes('759bc8ed-5ecd-475c-8a4c-e35fcf628a73'))
      // Existing fixture parses the SQL's actual JSON result under its legacy wrapper key.
      // Adapt only that JavaScript wrapper; SQL and database receipt remain unmodified.
      const observedSetup = fixture.executeSetupSql(setup)[0].tll_generation_23_credential_receipt
      assert.equal(observedSetup.windowId, OWNER_SUCCESSOR_WINDOW_ID)
      assert.equal(api.credentials.validateOwnerSuccessorCredentialReceipt([
        { tll_owner_successor_credential_receipt: observedSetup }],
      { expiresAt: fixture.expiresAt, nowMs: Date.now() }).status, 'PASS')
      assert.deepEqual(fixture.proveRestrictedConnections(), { status: 'PASS', runtimeCount: 5 })
      // These are fixture bootstrap mutations, NOT native activation/shutdown acceptance.
      assert.equal(fixture.enableControls().count, 5)
      assert.equal(fixture.disableControls().count, 5)
      const retirement = api.retirement.buildOwnerSuccessorRecoverySql({ expiresAt: fixture.expiresAt })
      const observedRetirement = fixture.executeRetirementSql(retirement)[0].tll_generation_23_recovery_receipt
      assert.equal(observedRetirement.windowId, OWNER_SUCCESSOR_WINDOW_ID)
      assert.equal(api.retirement.validateOwnerSuccessorRecoveryReceipt([
        { tll_owner_successor_recovery_receipt: observedRetirement }],
      { expiresAt: fixture.expiresAt }).status, 'PASS_RETIRED')
      const observedFinal = JSON.parse(fixture.executePostflightReadOnlySql(api['final-check'].buildOwnerSuccessorFinalCheckSql()))
      assert.equal(observedFinal.windowId, OWNER_SUCCESSOR_WINDOW_ID)
      assert.equal(api['final-check'].validateOwnerSuccessorFinalCheck([
        { tll_owner_successor_final_check: observedFinal }]).status, 'PASS_FINAL_RETIRED')
      const final = fixture.proveRetired()
      assert.equal(final.passwordProof, 'SCRAM')
      for (const name of ['wrongPasswordRejected', 'privateControlReadDenied', 'setupReplayRejected',
        'retiredLoginRejected', 'recoveryReplayRejected']) assert.equal(final[name], true)
    } finally { fixture.dispose() }
  })

test('fresh native setup rejects a bootstrap superuser instead of weakening managed operator guards',
  { skip: dockerAbsent ? 'Docker binary absent; actual operator denial not executed' : false, timeout: 90_000 }, async () => {
    assert.match(docker(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']), /^unix:\/\//)
    const name = `tll-successor-operator-${randomUUID().slice(0, 12)}`
    assert.equal(docker(['ps', '-a', '--filter', `name=^/${name}$`, '--format', '{{.Names}}']), '')
    let owned = false
    try {
      docker(['run', '--rm', '-d', '--name', name, '--network', 'none',
        '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_PASSWORD=synthetic-operator-guard',
        'postgres:17-alpine'])
      owned = true
      let ready = false
      for (let n = 0; n < 100; n++) {
        try {
          assert.equal(docker(['exec', name, 'cat', '/proc/1/comm']), 'postgres')
          docker(['exec', name, 'pg_isready', '-U', 'postgres']); ready = true; break
        } catch { await new Promise(resolve => setTimeout(resolve, 100)) }
      }
      assert.equal(ready, true)
      assert.equal(docker(['inspect', '--format', '{{.Config.Image}} {{.HostConfig.NetworkMode}}', name]), 'postgres:17-alpine none')
      const expiresAt = new Date(Math.floor((Date.now() + 45 * 60_000) / 1000) * 1000).toISOString()
      const api = await nativeTestSql(expiresAt)
      const verifiers = Object.fromEntries(PASSWORD_PURPOSES.map((purpose, index) => [purpose,
        deriveScramVerifier(`synthetic-operator-${purpose}`.repeat(4), Buffer.alloc(18, index + 1))]))
      const setup = api.credentials.buildOwnerSuccessorCredentialSql({ expiresAt, verifiers, nowMs: Date.now() })
      assert.throws(() => docker(['exec', '-i', name, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres',
        '-v', 'ON_ERROR_STOP=1'], setup), error => {
        assert.match(error.stderr.toString(), /Generation 23 operator mismatch/)
        return true
      })
      assert.equal(docker(['exec', name, 'psql', '-XqAt', '-U', 'postgres', '-d', 'postgres', '-c',
        "SELECT count(*) FROM pg_roles WHERE rolname LIKE 'tll_%_runtime'"]), '0')
    } finally { if (owned) docker(['rm', '-f', name]) }
  })
