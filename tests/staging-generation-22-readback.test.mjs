import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { HOSTED_BASELINE_VERCEL_TARGET } from '../scripts/staging-account-hosted-baseline-vercel.mjs'
import { DISABLED_VERCEL_CONFIGURATION, MISSING_VERCEL_SECRET_NAMES } from '../scripts/staging-generation-22-material.mjs'
import { assessStagingGeneration22Readback } from '../scripts/staging-generation-22-readback.mjs'

async function armed() {
  let source = await readFile(new URL('../scripts/staging-generation-22-readback.mjs', import.meta.url), 'utf8')
  const scripts = new URL('../scripts/', import.meta.url)
  source = source.replace('export const STAGING_GENERATION_22_READBACK_ENABLED = false',
    'export const STAGING_GENERATION_22_READBACK_ENABLED = true').replaceAll("from './", `from '${scripts.href}`)
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
}

function fixture() {
  const configNames = Object.keys(DISABLED_VERCEL_CONFIGURATION).sort()
  const configIds = Object.fromEntries(configNames.map((name, index) => [name, `env_config_${index + 1}`]))
  return {
    inventory: { target: HOSTED_BASELINE_VERCEL_TARGET, environment: 'preview',
      branch: HOSTED_BASELINE_VERCEL_TARGET.branch, entries: [
        ...MISSING_VERCEL_SECRET_NAMES.map(key => ({ key, type: 'sensitive', visibility: 'secret', scope: 'branch' })),
        ...configNames.map(key => ({ key, type: 'encrypted', visibility: 'config', scope: 'branch' })),
      ] },
    edgeEvidence: { projectRef: 'qdmvngjwkcsilzmqksme',
      names: ['TLL_STAGING_SUBJECT_BROKER_CLIENT_SECRET', 'TLL_STAGING_BROKER_DATABASE_PASSWORD'] },
    configIds,
    configValues: configNames.map(key => ({ id: configIds[key], key, value: DISABLED_VERCEL_CONFIGURATION[key],
      gitBranch: HOSTED_BASELINE_VERCEL_TARGET.branch, target: ['preview'], type: 'encrypted',
      visibility: 'config', decrypted: true })),
  }
}

test('post-stage readback stays disabled by default', () => {
  assert.throws(() => assessStagingGeneration22Readback(fixture()), /unavailable/)
})

test('exact scoped secrets, Edge name, and four readable OFF controls pass', async () => {
  const { assessStagingGeneration22Readback: assess } = await armed()
  assert.deepEqual(assess(fixture()), { status: 'DISABLED_SETTINGS_VERIFIED',
    projectRef: 'qdmvngjwkcsilzmqksme', branch: 'codex/tll-integration',
    vercelSecretCount: 16, disabledControlCount: 4, edgePasswordNamePresent: true })
})

test('an enabled control or mismatched ID cannot pass readback', async () => {
  const { assessStagingGeneration22Readback: assess } = await armed()
  const enabled = fixture()
  enabled.configValues[0].value = 'enabled'
  assert.throws(() => assess(enabled), /unavailable/)
  const wrongId = fixture()
  wrongId.configValues[0].id = 'env_unrelated'
  assert.throws(() => assess(wrongId), /unavailable/)
})

test('general-Preview or wrong-classification secrets and missing Edge name fail', async () => {
  const { assessStagingGeneration22Readback: assess } = await armed()
  const general = fixture()
  general.inventory.entries[0].scope = 'preview'
  assert.throws(() => assess(general), /unavailable/)
  const notSecret = fixture()
  notSecret.inventory.entries[0].visibility = 'config'
  assert.throws(() => assess(notSecret), /unavailable/)
  const missingEdge = fixture()
  missingEdge.edgeEvidence.names.pop()
  assert.throws(() => assess(missingEdge), /unavailable/)
  const wrongProject = fixture()
  wrongProject.edgeEvidence.projectRef = 'wrhgscovsgsudtedbljr'
  assert.throws(() => assess(wrongProject), /unavailable/)
})

test('duplicates and non-decrypted values cannot prove disabled state', async () => {
  const { assessStagingGeneration22Readback: assess } = await armed()
  const duplicate = fixture()
  duplicate.inventory.entries.push({ ...duplicate.inventory.entries[0] })
  assert.throws(() => assess(duplicate), /unavailable/)
  const undecrypted = fixture()
  undecrypted.configValues[0].decrypted = false
  assert.throws(() => assess(undecrypted), /unavailable/)
})
