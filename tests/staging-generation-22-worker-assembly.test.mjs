import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration22WorkerAssembly,
  FIXED_GENERATION_22_PARTS } from '../scripts/staging-generation-22-worker-assembly.mjs'
import { MISSING_VERCEL_SECRET_NAMES,
  DISABLED_VERCEL_CONFIGURATION } from '../scripts/staging-generation-22-material.mjs'
import { WORKER_TERMINAL_SCHEMA } from '../scripts/staging-generation-22-process-supervisor.mjs'

const scripts = new URL('../scripts/', import.meta.url)
const managementTokenValue = `sbp_${'a'.repeat(40)}`
const vercelTokenValue = 'fixture-vercel-token'
async function armed(file, flag) {
  const source = (await readFile(new URL(file, scripts), 'utf8'))
    .replace(`export const ${flag} = false`, `export const ${flag} = true`)
    .replace("from '../lib/server/staging-postgres.ts'",
      `from '${new URL('../lib/server/staging-postgres.ts', scripts).href}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

function fakeParts(realCore, { fail = null } = {}) {
  const calls = [], copies = []
  const copyOwner = (token, label, methods) => {
    const copy = Buffer.from(token)
    copies.push(copy)
    return { ...methods, dispose() { calls.push(`dispose:${label}`); copy.fill(0) } }
  }
  const result = { ...FIXED_GENERATION_22_PARTS,
    createJournal() { calls.push('journal'); return {} },
    createRecoveryJournal() { calls.push('recovery-journal'); return {} },
    createDatabaseHost({ post }) { return { async install({ signal }) {
      calls.push('database')
      return post('credential-packet', { signal })
    } } },
    createVercelHost({ token }) { return copyOwner(token, 'vercel', {
      async stageSecret({ name }) { calls.push(`vercel:${name}`) },
    }) },
    createEdgeHost({ token }) { return copyOwner(token, 'edge', {
      async stageSecret() { calls.push('edge') },
    }) },
    createConfigHost({ token }) { return copyOwner(token, 'config', {
      async stageDisabled({ name }) { calls.push(`config:${name}`) },
    }) },
    createVercelReader({ vercelToken }) { return copyOwner(vercelToken, 'vercel-reader', {
      readProject() {}, readEffectivePreviewEnvironmentInventory() {},
    }) },
    createSupabaseReader({ managementToken }) { return copyOwner(managementToken, 'supabase-reader', {
      target: 'qdmvngjwkcsilzmqksme', readEdgeSecretNames() {},
    }) },
    createReadback({ vercel, supabase, config }) {
      assert.equal(typeof vercel.readProject, 'function')
      assert.equal(supabase.target, 'qdmvngjwkcsilzmqksme')
      assert.equal(typeof config.stageDisabled, 'function')
      return { async prove() { calls.push('readback') } }
    },
    createConnectionProof({ createRuntime }) {
      assert.equal(createRuntime, result.createRuntime)
      return { async prove() { calls.push('five-logins-drained') } }
    },
    createSetup({ database, vercel, edge, config, readback, connections }) {
      return { async stage({ signal }) {
        await database.install({ signal })
        for (const name of MISSING_VERCEL_SECRET_NAMES) await vercel.stageSecret({ name })
        await edge.stageSecret({})
        for (const name of Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()) {
          await config.stageDisabled({ name })
        }
        await readback.prove()
        await connections.prove()
        return { status: 'SETTINGS_AND_CONNECTIONS_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme',
          generation: 22, operationCount: 22 }
      } }
    },
    createRecoveryHost({ post }) { return { async retire({ signal }) {
      calls.push('retirement')
      return post('recovery-packet', { signal })
    } } },
    createRecovery({ active, recovery, retired }) { return { async recover({ signal }) {
      await active.prove({ expiresAt: 'fixture-expiry', signal })
      await recovery.retire({ signal })
      await retired.prove({ expiresAt: 'fixture-expiry', signal })
      return { status: 'RECOVERY_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme', generation: 22 }
    } } },
    createCore: realCore,
    createRuntime() {},
    async postCredential(packet, { token }) {
      assert.equal(packet, 'credential-packet')
      assert.equal(token.toString(), managementTokenValue)
      if (fail === 'setup') throw Error('lost installation reply')
      return { status: 'installed' }
    },
    async postRecovery(packet, { token }) {
      assert.equal(packet, 'recovery-packet')
      assert.equal(token.toString(), managementTokenValue)
      if (fail === 'retirement') throw Error('lost retirement reply')
      return { status: 'retired' }
    },
    async postActive(_expiresAt, { token }) {
      calls.push('active-read')
      assert.equal(token.toString(), managementTokenValue)
      return ['active-row']
    },
    async postRetired(_expiresAt, { token }) {
      calls.push('retired-read')
      assert.equal(token.toString(), managementTokenValue)
      return ['retired-row']
    },
    validateActive(rows) { assert.deepEqual(rows, ['active-row']); return { status: 'PASS_ACTIVE' } },
    validateRetired(rows) { assert.deepEqual(rows, ['retired-row']); return { status: 'PASS_RETIRED' } },
  }
  return { parts: result, calls, copies }
}

test('assembly cannot construct hosts or acquire credentials while disabled', () => {
  let called = false
  assert.throws(() => createStagingGeneration22WorkerAssembly({
    managementToken: Buffer.from(managementTokenValue), vercelToken: Buffer.from(vercelTokenValue),
    parts: { ...FIXED_GENERATION_22_PARTS, createJournal() { called = true } },
  }), /unavailable/)
  assert.equal(called, false)
})

test('assembled worker runs 22 setup operations, five-logins proof, retirement and final read in order', async () => {
  const { createStagingGeneration22WorkerAssembly: assemble } = await armed(
    'staging-generation-22-worker-assembly.mjs', 'STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED')
  const { createStagingGeneration22WorkerCore: realCore } = await armed(
    'staging-generation-22-worker-core.mjs', 'STAGING_GENERATION_22_WORKER_CORE_ENABLED')
  const fixture = fakeParts(realCore)
  const assembly = assemble({ managementToken: Buffer.from(managementTokenValue),
    vercelToken: Buffer.from(vercelTokenValue), parts: fixture.parts })
  assert.deepEqual(fixture.calls, ['journal', 'recovery-journal'])
  const terminal = await assembly.core.run({ signal: new AbortController().signal })
  assert.equal(terminal.status, 'DRAINED')
  assert.equal(fixture.calls.filter(call => call === 'database' || call.startsWith('vercel:')
    || call === 'edge' || call.startsWith('config:')).length, 22)
  assert.deepEqual(fixture.calls.slice(-5), ['readback', 'five-logins-drained', 'active-read',
    'retirement', 'retired-read'])
  assembly.dispose()
  assert.equal(fixture.copies.length, 5)
  assert.equal(fixture.copies.every(copy => copy.every(byte => byte === 0)), true)
})

test('lost setup or retirement reply never emits success and still disposes every token copy', async () => {
  const { createStagingGeneration22WorkerAssembly: assemble } = await armed(
    'staging-generation-22-worker-assembly.mjs', 'STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED')
  const { createStagingGeneration22WorkerCore: realCore } = await armed(
    'staging-generation-22-worker-core.mjs', 'STAGING_GENERATION_22_WORKER_CORE_ENABLED')
  for (const fail of ['setup', 'retirement']) {
    const fixture = fakeParts(realCore, { fail })
    const assembly = assemble({ managementToken: Buffer.from(managementTokenValue),
      vercelToken: Buffer.from(vercelTokenValue), parts: fixture.parts })
    const result = await assembly.core.run({ signal: new AbortController().signal })
    assert.equal(result.status, fail === 'setup'
      ? 'SETUP_RECONCILIATION_REQUIRED' : 'RECOVERY_RECONCILIATION_REQUIRED')
    assert.equal(fixture.calls.includes('retirement'), fail === 'retirement')
    assert.equal(fixture.calls.includes('retired-read'), false)
    if (fail === 'setup') assert.equal(fixture.calls.includes('active-read'), false)
    assembly.dispose()
    assert.equal(fixture.copies.every(copy => copy.every(byte => byte === 0)), true)
  }
})

test('the child entry publishes only after the assembled full run and all token copies are erased', async () => {
  const { createStagingGeneration22WorkerAssembly: assemble } = await armed(
    'staging-generation-22-worker-assembly.mjs', 'STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED')
  const { createStagingGeneration22WorkerCore: realCore } = await armed(
    'staging-generation-22-worker-core.mjs', 'STAGING_GENERATION_22_WORKER_CORE_ENABLED')
  const { runStagingGeneration22Worker: run } = await armed(
    'staging-generation-22-worker-entry.mjs', 'STAGING_GENERATION_22_WORKER_ENTRY_ENABLED')
  const fixture = fakeParts(realCore), originals = {
    managementToken: Buffer.from(managementTokenValue), vercelToken: Buffer.from(vercelTokenValue),
  }
  let output, released = false
  const result = await run({ signal: new AbortController().signal,
    accept() { return () => { released = true } },
    readCredentials() { return originals },
    createWorker(credentials) { return assemble({ ...credentials, parts: fixture.parts }) },
    write(value) {
      assert.equal(fixture.copies.every(copy => copy.every(byte => byte === 0)), true)
      assert.equal(Object.values(originals).every(token => token.every(byte => byte === 0)), true)
      output = JSON.parse(value)
    },
  })
  assert.equal(result, true)
  assert.equal(released, true)
  assert.equal(output.schema, WORKER_TERMINAL_SCHEMA)
  assert.equal(output.status, 'DRAINED')
})

test('partial construction disposes already copied tokens before refusing the run', async () => {
  const { createStagingGeneration22WorkerAssembly: assemble } = await armed(
    'staging-generation-22-worker-assembly.mjs', 'STAGING_GENERATION_22_WORKER_ASSEMBLY_ENABLED')
  const { createStagingGeneration22WorkerCore: realCore } = await armed(
    'staging-generation-22-worker-core.mjs', 'STAGING_GENERATION_22_WORKER_CORE_ENABLED')
  const fixture = fakeParts(realCore)
  fixture.parts.createSupabaseReader = () => { throw Error('synthetic construction failure') }
  assert.throws(() => assemble({ managementToken: Buffer.from(managementTokenValue),
    vercelToken: Buffer.from(vercelTokenValue), parts: fixture.parts }), /unavailable/)
  assert.equal(fixture.copies.length, 4)
  assert.equal(fixture.copies.every(copy => copy.every(byte => byte === 0)), true)
  assert.equal(fixture.calls.some(call => call === 'database'), false)
})
