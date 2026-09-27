import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration23LocalDatabaseFixture } from './staging-generation-23-database-acceptance.mjs'

test('Generation 23 final read proves real PostgreSQL retirement with inert operator links',
  { timeout: 60_000 }, async () => {
    const database = await createStagingGeneration23LocalDatabaseFixture()
    try {
      const source = await readFile(new URL('../scripts/staging-generation-23-final-check.mjs', import.meta.url), 'utf8')
      const armed = source
        .replace('export const STAGING_GENERATION_23_FINAL_CHECK_ENABLED = false',
          'export const STAGING_GENERATION_23_FINAL_CHECK_ENABLED = true')
        .replace("from './staging-generation-23-credentials.mjs'",
          `from 'data:text/javascript,export const ACTIVE_WINDOW_EXPIRES_AT=${JSON.stringify(database.expiresAt)};export const WINDOW_ID=%227d0e8f17-eac4-40e1-a5b5-8a8597d502a9%22'`)
        .replaceAll("from './", `from '${new URL('../scripts/', import.meta.url).href}`)
      const final = await import(`data:text/javascript;base64,${Buffer.from(armed).toString('base64')}`)
      database.setup()
      database.proveRestrictedConnections()
      database.enableControls()
      database.disableControls()
      database.retire()
      const raw = database.executePostflightReadOnlySql(final.buildStagingGeneration23FinalCheckSql())
      const result = final.validateStagingGeneration23FinalCheck([
        { tll_generation_23_final_check: JSON.parse(raw) },
      ])
      assert.equal(result.status, 'PASS_FINAL_RETIRED')
      database.proveRetired()
    } finally { database.dispose() }
  })
