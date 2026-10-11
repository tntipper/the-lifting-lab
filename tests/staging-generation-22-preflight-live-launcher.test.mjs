import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { STAGING_GENERATION_22_PREFLIGHT_PATHS } from '../scripts/staging-generation-22-preflight-journal.mjs'

const launcher = resolve('scripts/staging-generation-22-preflight-live-launcher.mjs')

test('repository preflight launcher refuses both modes without creating a record', () => {
  for (const mode of ['vercel', 'supabase']) {
    const existed = existsSync(STAGING_GENERATION_22_PREFLIGHT_PATHS[mode])
    const output = execFileSync(process.execPath, [launcher, mode], { encoding: 'utf8', timeout: 10_000 })
    assert.deepEqual(JSON.parse(output), { status: 'GENERATION_22_PREFLIGHT_DISABLED' })
    assert.equal(existsSync(STAGING_GENERATION_22_PREFLIGHT_PATHS[mode]), existed)
  }
})
