import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { EDGE_PASSWORD_NAME, VERCEL_PASSWORD_NAMES } from '../scripts/staging-generation-23-password-material.mjs'

const source = await readFile(new URL('../scripts/staging-generation-23-settings-readback.mjs', import.meta.url), 'utf8')
const scripts = new URL('../scripts/', import.meta.url)
const armed = source.replace('export const STAGING_GENERATION_23_SETTINGS_READBACK_ENABLED = false',
  'export const STAGING_GENERATION_23_SETTINGS_READBACK_ENABLED = true')
  .replaceAll("from './", `from '${scripts.href}`)
assert.notEqual(armed, source)
const { createStagingGeneration23SettingsReadback } = await import(
  `data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)
const targets = VERCEL_PASSWORD_NAMES.map((name, index) => ({ name, id: `env_gen23_${index}`,
  branch: 'codex/tll-integration', target: 'preview', classification: 'sensitive' }))
const signal = new AbortController().signal

test('six setting writes require a matching value-free Vercel and Edge readback', async () => {
  const proof = createStagingGeneration23SettingsReadback({
    readVercelTargets: async () => targets.map(item => ({ ...item })),
    readEdgeNames: async () => ['OTHER_STAGING_NAME', EDGE_PASSWORD_NAME],
  })
  assert.deepEqual(await proof.prove({ expectedTargets: targets, signal }), {
    status: 'SETTINGS_METADATA_VERIFIED', projectRef: 'qdmvngjwkcsilzmqksme',
    branch: 'codex/tll-integration', vercelCount: 5, edgeNamePresent: true,
    valuesReadable: false,
  })
  await assert.rejects(proof.prove({ expectedTargets: targets, signal }), /unavailable/)
})

test('wrong branch or ID and missing or duplicate Edge name stop the route', async () => {
  for (const observed of [
    targets.map((item, index) => index === 0 ? { ...item, id: 'env_wrong' } : item),
    targets.map((item, index) => index === 0 ? { ...item, branch: 'main' } : item),
  ]) {
    const proof = createStagingGeneration23SettingsReadback({
      readVercelTargets: async () => observed, readEdgeNames: async () => [EDGE_PASSWORD_NAME],
    })
    await assert.rejects(proof.prove({ expectedTargets: targets, signal }), /unavailable/)
  }
  for (const names of [[], [EDGE_PASSWORD_NAME, EDGE_PASSWORD_NAME]]) {
    const proof = createStagingGeneration23SettingsReadback({
      readVercelTargets: async () => targets, readEdgeNames: async () => names,
    })
    await assert.rejects(proof.prove({ expectedTargets: targets, signal }), /unavailable/)
  }
})
