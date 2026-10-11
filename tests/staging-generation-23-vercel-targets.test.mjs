import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { selectStagingGeneration23VercelPasswordTargets,
  STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED } from '../scripts/staging-generation-23-vercel-targets.mjs'

const names = ['TLL_STAGING_BRIDGE_DATABASE_PASSWORD', 'TLL_STAGING_BROKER_DATABASE_PASSWORD',
  'TLL_STAGING_CART_DATABASE_PASSWORD', 'TLL_STAGING_CUSTOMER_DATABASE_PASSWORD',
  'TLL_STAGING_PROVISIONAL_DATABASE_PASSWORD']
const entries = () => names.map((key, index) => ({ id: `env_gen23_${index}`, key,
  target: ['preview'], gitBranch: 'codex/tll-integration', type: 'sensitive', visibility: 'secret',
  value: 'never-return-this-secret' }))
async function armedFixture() {
  const scripts = new URL('../scripts/', import.meta.url)
  const source = (await readFile(new URL('staging-generation-23-vercel-targets.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = false',
      'export const STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED = true')
    .replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

test('the target selector is disabled by default', () => {
  assert.equal(STAGING_GENERATION_23_VERCEL_TARGETS_ENABLED, false)
  assert.throws(() => selectStagingGeneration23VercelPasswordTargets({ envs: entries() }), /unavailable/)
})

test('exact existing branch IDs are returned without secret values', async () => {
  const { selectStagingGeneration23VercelPasswordTargets: select,
    validateStagingGeneration23VercelPatchReceipt: validate } = await armedFixture()
  const selected = select({ envs: [...entries(), { id: 'other', key: 'SOME_OTHER_NAME',
    value: 'another-secret' }], pagination: { next: null } })
  assert.deepEqual(selected.map(item => item.name), names)
  assert.equal(new Set(selected.map(item => item.id)).size, 5)
  assert.doesNotMatch(JSON.stringify(selected), /never-return|another-secret|value/)
  const result = validate({ id: selected[0].id, key: selected[0].name,
    target: ['preview'], gitBranch: selected[0].branch, type: 'sensitive', visibility: 'secret',
    value: 'masked-or-clear-value-is-discarded' }, selected[0])
  assert.equal(result.status, 'REPLACED')
  assert.doesNotMatch(JSON.stringify(result), /masked-or-clear|value/)
})

test('missing, duplicate, broad-scope or reclassified rows fail closed', async () => {
  const { selectStagingGeneration23VercelPasswordTargets: select,
    validateStagingGeneration23VercelPatchReceipt: validate } = await armedFixture()
  const good = entries()
  for (const changed of [good.slice(1), [...good, good[0]],
    good.map((entry, index) => index ? entry : { ...entry, gitBranch: 'main' }),
    good.map((entry, index) => index ? entry : { ...entry, target: ['preview', 'production'] }),
    good.map((entry, index) => index ? entry : { ...entry, visibility: 'config' }),
    good.map((entry, index) => index ? entry : { ...entry, id: good[1].id })]) {
    assert.throws(() => select({ envs: changed }), /unavailable/)
  }
  assert.throws(() => select({ envs: good, pagination: { next: 'more' } }), /unavailable/)
  const selected = select({ envs: good })[0]
  const receipt = { id: selected.id, key: selected.name, target: ['preview'],
    gitBranch: selected.branch, type: 'sensitive', visibility: 'secret' }
  for (const changed of [{ ...receipt, id: 'other' }, { ...receipt, gitBranch: 'main' },
    { ...receipt, target: ['production'] }, { ...receipt, visibility: 'config' }]) {
    assert.throws(() => validate(changed, selected), /unavailable/)
  }
})
