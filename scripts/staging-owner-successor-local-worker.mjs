#!/usr/bin/env node
/** Fixed fixture-only child. No CLI credential/env/native transport injection. */
import { readFileSync, lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { acceptSupervisorPipe } from './staging-provider-broker-recovery-process-control.mjs'
import { LOCAL_SUCCESSOR_PROOF, successorLocalBindingDigest } from './staging-owner-successor-local-process.mjs'
import { issueSyntheticSuccessorCapability, createMockSuccessorTransport, runSuccessorLocalOnce } from './staging-owner-successor-local-runtime.mjs'
async function worker() {
  const release = await acceptSupervisorPipe({ proof: LOCAL_SUCCESSOR_PROOF })
  try {
    if (process.argv.length !== 3) throw Error('Invalid local request')
    const path = resolve(process.argv[2]), stat = lstatSync(path)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.uid !== process.getuid()
      || (stat.mode & 0o777) !== 0o600 || stat.size > 4096) throw Error('Invalid local request')
    const raw = readFileSync(path, 'utf8'), request = JSON.parse(raw)
    if (raw !== `${JSON.stringify(request)}\n`
      || Object.keys(request).sort().join('|') !== 'action|bindingSha256|crashAt|failAt|hangAt|lateAt|plan|root|schema|uncertainSettlement'
      || request.schema !== 'tll-successor-local-request/v1' || request.bindingSha256 !== successorLocalBindingDigest())
      throw Error('Invalid local request')
    const nowMs = Date.now()
    const capability = issueSyntheticSuccessorCapability({ plan: request.plan, action: request.action,
      nowMs, validUntilMs: nowMs + 30_000, reviewedSourceSha: request.plan.sourceSha })
    let initialEntries = []
    if (request.action === 'LOCAL_RECOVERY') {
      // Durable loader validates the ledger before any operation; mock starts conservatively enabled.
      initialEntries = ['databaseSetup', 'databaseEnable', 'surfaceEnable'].map(phase => ({ phase }))
    }
    const port = createMockSuccessorTransport({ ...request, initialEntries })
    const answer = await runSuccessorLocalOnce({ capability, port, root: request.root, plan: request.plan,
      action: request.action, phaseTimeoutMs: 15 })
    process.stdout.write(`${JSON.stringify(answer)}\n`)
  } finally { release() }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await worker() } catch { process.exitCode = 1 }
}
