/**
 * Secret-free contract: Gen N recovery successor must pin Gen N credentials
 * WINDOW_ID / GENERATION (not a copy-paste leftover from Gen N-1).
 *
 * Gen 17 tip pinned Gen 16 successor (`313afec9-…`) — root cause for Gen 18
 * ENTRY_BASELINE_FAILED. Mint checklist must update recovery pins every generation.
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Parse `successor=Object.freeze({generation:N,windowId:'…'})` from a recovery generator. */
export function parseRecoverySuccessorPin(source) {
  if (typeof source !== 'string') return null
  const match = source.match(
    /(?:const|let|var)\s+successor\s*=\s*Object\.freeze\(\s*\{\s*generation\s*:\s*(\d+)\s*,\s*windowId\s*:\s*'([0-9a-f-]{36})'\s*\}\s*\)/,
  )
  if (!match) return null
  return Object.freeze({ generation: Number(match[1]), windowId: match[2] })
}

export async function loadGenerationCredentialPins(generation) {
  const path = resolve(root, `scripts/staging-generation-${generation}-credentials.mjs`)
  const mod = await import(pathToFileURL(path).href)
  return Object.freeze({
    generation: mod.GENERATION,
    windowId: mod.WINDOW_ID,
    packageId: mod.PACKAGE_ID,
  })
}

export function loadGenerationRecoverySuccessorPin(generation) {
  const path = resolve(root, `scripts/staging-generation-${generation}-recovery.mjs`)
  const source = readFileSync(path, 'utf8')
  const pin = parseRecoverySuccessorPin(source)
  if (!pin) throw new Error(`Generation-${generation} recovery successor pin unavailable`)
  return pin
}

/**
 * Assert recovery generator successor matches credentials package for each generation.
 * @param {number[]} generations
 */
export async function assertRecoverySuccessorPinsMatchCredentials(generations) {
  const results = []
  for (const generation of generations) {
    const credentials = await loadGenerationCredentialPins(generation)
    const successor = loadGenerationRecoverySuccessorPin(generation)
    if (credentials.generation !== generation) {
      throw new Error(`Generation-${generation} credentials GENERATION mismatch`)
    }
    if (successor.generation !== credentials.generation || successor.windowId !== credentials.windowId) {
      throw new Error(
        `Generation-${generation} recovery successor pin mismatch: recovery={generation:${successor.generation},windowId:${successor.windowId}} credentials={generation:${credentials.generation},windowId:${credentials.windowId}}`,
      )
    }
    // Generated SQL must also carry the same pins (catches stale artefacts).
    const sql = readFileSync(resolve(root, `config/staging-generation-${generation}-recovery.sql`), 'utf8')
    if (!sql.includes(credentials.windowId) || !sql.includes(`'generation',${credentials.generation}`)) {
      throw new Error(`Generation-${generation} recovery SQL artefact pin mismatch`)
    }
    if (sql.includes(`'generation',${generation - 1}`) && generation >= 15) {
      // Allow Gen 6 template residue only via the source transform — successor writes must be this gen.
      // Soft check: previous-gen window must not appear.
      const prev = await loadGenerationCredentialPins(generation - 1).catch(() => null)
      if (prev && sql.includes(prev.windowId)) {
        throw new Error(`Generation-${generation} recovery SQL still pins predecessor window ${prev.windowId}`)
      }
    }
    results.push(Object.freeze({ generation, windowId: credentials.windowId, packageId: credentials.packageId, status: 'PASS' }))
  }
  return Object.freeze(results)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const generations = [15, 16, 17, 18, 19]
    const results = await assertRecoverySuccessorPinsMatchCredentials(generations)
    process.stdout.write(`${JSON.stringify({ status: 'PASS', results }, null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
