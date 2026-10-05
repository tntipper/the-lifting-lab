/** Real fixed parent invokes its real fixed child with only external transports intercepted. */
import './owner-successor-default-transport-denial.mjs'
const { runBoundedOwnerSuccessorWorker } = await import('../../scripts/staging-owner-successor-process-binding.mjs')
const result = await runBoundedOwnerSuccessorWorker()
process.stdout.write(`${JSON.stringify(result)}\n`)
