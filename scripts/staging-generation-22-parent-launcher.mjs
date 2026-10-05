#!/usr/bin/env node
/** Disabled, secret-free entry point for the one-use Generation 22 supervisor. */
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createStagingGeneration22FixedSpawner } from './staging-generation-22-process-binding.mjs'
import { createStagingGeneration22ProcessSupervisor } from './staging-generation-22-process-supervisor.mjs'
import { GENERATION, PROJECT_REF } from './staging-generation-22-material.mjs'

export const STAGING_GENERATION_22_PARENT_LAUNCHER_ENABLED = false
export const STAGING_GENERATION_22_PARENT_CLI_ENABLED = false
const unavailable = () => { throw Error('Generation 22 parent launcher unavailable') }
const exact = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join('|') === [...keys].sort().join('|')

/** The live CLI supplies neither factory: it uses the fixed spawner and supervisor. */
export async function runStagingGeneration22Parent({ signal,
  createSpawner = createStagingGeneration22FixedSpawner,
  createSupervisor = createStagingGeneration22ProcessSupervisor } = {}) {
  if (!STAGING_GENERATION_22_PARENT_LAUNCHER_ENABLED || !signal || signal.aborted
    || typeof signal.addEventListener !== 'function'
    || typeof signal.removeEventListener !== 'function'
    || typeof createSpawner !== 'function' || typeof createSupervisor !== 'function') unavailable()
  const spawnWorker = createSpawner()
  if (typeof spawnWorker !== 'function') unavailable()
  const supervisor = createSupervisor({ spawnWorker })
  if (typeof supervisor?.supervise !== 'function') unavailable()
  const result = await supervisor.supervise({ signal })
  if (signal.aborted || !exact(result, ['status', 'projectRef', 'generation'])
    || !['VERIFIED_CONTROLS_DISABLED', 'CHILD_EXIT_RECONCILIATION_REQUIRED'].includes(result.status)
    || result.projectRef !== PROJECT_REF || result.generation !== GENERATION) unavailable()
  return Object.freeze({ status: result.status, projectRef: PROJECT_REF, generation: GENERATION })
}

if (import.meta.url.startsWith('file:') && process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!STAGING_GENERATION_22_PARENT_CLI_ENABLED || process.argv.length !== 2) process.exitCode = 1
  else {
    const controller = new AbortController()
    const abort = () => controller.abort()
    process.once('SIGINT', abort)
    process.once('SIGTERM', abort)
    try {
      const result = await runStagingGeneration22Parent({ signal: controller.signal })
      await new Promise((resolveWrite, rejectWrite) => {
        process.stdout.write(`${JSON.stringify(result)}\n`, error => error ? rejectWrite(error) : resolveWrite())
      })
      process.exitCode = result.status === 'VERIFIED_CONTROLS_DISABLED' ? 0 : 1
    } catch { process.exitCode = 1 }
    finally {
      process.removeListener('SIGINT', abort)
      process.removeListener('SIGTERM', abort)
    }
  }
}
