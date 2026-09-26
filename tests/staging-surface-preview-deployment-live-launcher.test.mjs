import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const path = fileURLToPath(new URL('../scripts/staging-surface-preview-deployment-live-launcher.mjs', import.meta.url))

test('Preview live launcher stays behind one literal false gate and empty source pins', () => {
  const source = readFileSync(path, 'utf8')
  assert.equal((source.match(/^export const STAGING_PREVIEW_DEPLOYMENT_LIVE_ENABLED = false$/gm) ?? []).length, 1)
  assert.match(source, /^export const STAGING_PREVIEW_DEPLOYMENT_SOURCE_COMMIT = ''$/m)
  assert.match(source, /^export const STAGING_PREVIEW_DEPLOYMENT_MANIFEST_SHA256 = ''$/m)
  assert.match(source, /createStagingPreviewDeploymentJournal/)
})
