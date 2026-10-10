import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { DISABLED_VERCEL_CONFIGURATION, MISSING_VERCEL_SECRET_NAMES } from '../scripts/staging-generation-22-material.mjs'
import { createStagingGeneration22PoststageReadback } from '../scripts/staging-generation-22-poststage-readback.mjs'

const names = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  let assessor = await readFile(new URL('staging-generation-22-readback.mjs', scripts), 'utf8')
  assessor = assessor.replace('export const STAGING_GENERATION_22_READBACK_ENABLED = false',
    'export const STAGING_GENERATION_22_READBACK_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  const assessorUrl = `data:text/javascript;base64,${Buffer.from(assessor).toString('base64')}`
  let runner = await readFile(new URL('staging-generation-22-poststage-readback.mjs', scripts), 'utf8')
  runner = runner.replace('export const STAGING_GENERATION_22_POSTSTAGE_READBACK_ENABLED = false',
    'export const STAGING_GENERATION_22_POSTSTAGE_READBACK_ENABLED = true')
    .replace("from './staging-generation-22-readback.mjs'", `from '${assessorUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(runner).toString('base64')}`)
}
function fixture() {
  const ids = Object.fromEntries(names.map((name, index) => [name, `env_config_${index + 1}`]))
  const createdControls = Object.fromEntries(names.map(name => [name, {
    status: 'STAGED', name, id: ids[name], branch: HOSTED_BASELINE_VERCEL_TARGET.branch,
    target: 'preview', classification: 'config',
  }]))
  const calls = []
  const vercel = {
    async readProject() { calls.push('project'); return { target: HOSTED_BASELINE_VERCEL_TARGET,
      repository: { provider: 'github', repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab',
        ownerId: 17, productionBranch: 'main', sourceless: false } } },
    async readEffectivePreviewEnvironmentInventory() {
      calls.push('inventory')
      return { target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
        branch: HOSTED_BASELINE_VERCEL_TARGET.branch, entries: [
          ...MISSING_VERCEL_SECRET_NAMES.map(key => ({ key, type: 'sensitive', visibility: 'secret', scope: 'branch' })),
          ...names.map(key => ({ key, type: 'encrypted', visibility: 'config', scope: 'branch' })),
        ] }
    },
  }
  const supabase = { target: 'qdmvngjwkcsilzmqksme', async readEdgeSecretNames() {
    calls.push('edge'); return ['TLL_STAGING_BROKER_DATABASE_PASSWORD']
  } }
  const config = { async readDisabled({ name }) {
    calls.push(`config:${name}`)
    return { id: ids[name], key: name, value: DISABLED_VERCEL_CONFIGURATION[name],
      gitBranch: HOSTED_BASELINE_VERCEL_TARGET.branch, target: 'preview', type: 'encrypted',
      visibility: 'config', decrypted: true }
  } }
  return { createdControls, vercel, supabase, config, calls }
}

test('post-stage readback runner is disabled by default', () => {
  const values = fixture()
  assert.throws(() => createStagingGeneration22PoststageReadback(values), /unavailable/)
})

test('readback proves branch secrets, Edge password name and four OFF values once', async () => {
  const { createStagingGeneration22PoststageReadback: create } = await armed()
  const values = fixture()
  const runner = create(values)
  const result = await runner.prove({ createdControls: values.createdControls,
    signal: new AbortController().signal })
  assert.equal(result.status, 'DISABLED_SETTINGS_VERIFIED')
  assert.equal(result.vercelSecretCount, 16)
  assert.deepEqual(values.calls, ['project', 'inventory', 'edge', ...names.map(name => `config:${name}`)])
  await assert.rejects(runner.prove({ createdControls: values.createdControls,
    signal: new AbortController().signal }), /unavailable/)
})

test('wrong staging identity or created control blocks further reads', async () => {
  const { createStagingGeneration22PoststageReadback: create } = await armed()
  const wrong = fixture()
  wrong.supabase.target = 'wrhgscovsgsudtedbljr'
  assert.throws(() => create(wrong), /unavailable/)
  const badReceipt = fixture()
  badReceipt.createdControls[names[0]].branch = 'main'
  await assert.rejects(create(badReceipt).prove({ createdControls: badReceipt.createdControls,
    signal: new AbortController().signal }), /unavailable/)
  assert.deepEqual(badReceipt.calls, [])
  const wrongProject = fixture()
  wrongProject.vercel.readProject = async () => { wrongProject.calls.push('project'); return {
    target: { ...HOSTED_BASELINE_VERCEL_TARGET, projectId: 'wrong' },
    repository: { provider: 'github', repoId: 1264363509, org: 'tntipper', repo: 'the-lifting-lab',
      ownerId: 17, productionBranch: 'main', sourceless: false } } }
  await assert.rejects(create(wrongProject).prove({ createdControls: wrongProject.createdControls,
    signal: new AbortController().signal }), /unavailable/)
  assert.deepEqual(wrongProject.calls, ['project'])
})

test('readback times out even when a reader ignores its abort signal', async () => {
  const { createStagingGeneration22PoststageReadback: create } = await armed()
  const values = fixture()
  values.vercel.readProject = () => new Promise(() => {})
  const runner = create({ ...values, timeoutMs: 5 })
  await assert.rejects(runner.prove({ createdControls: values.createdControls,
    signal: new AbortController().signal }), /unavailable/)
})

test('enabled or undecrypted OFF setting cannot pass post-stage proof', async () => {
  const { createStagingGeneration22PoststageReadback: create } = await armed()
  for (const changed of [{ value: 'true' }, { decrypted: false }]) {
    const values = fixture()
    const original = values.config.readDisabled
    values.config.readDisabled = async input => ({ ...await original(input), ...changed })
    await assert.rejects(create(values).prove({ createdControls: values.createdControls,
      signal: new AbortController().signal }), /unavailable/)
  }
})
