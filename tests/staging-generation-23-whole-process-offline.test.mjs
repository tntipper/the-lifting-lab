import test from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { runBoundedBrokerRotationWorker } from '../scripts/staging-provider-broker-rotation-process-control.mjs'

const child = fileURLToPath(new URL('./staging-generation-23-composite-local-acceptance.mjs', import.meta.url))
const root = resolve(dirname(child), '..')

test('the entire networkless Gen23 route finishes under one parent process limit',
  { timeout: 100_000 }, async () => {
    const result = await runBoundedBrokerRotationWorker({ executable: process.execPath,
      args: [child, '--run-supervised-offline-once'], cwd: root,
      env: { PATH: process.env.PATH, LANG: 'C.UTF-8' },
      proof: 'TLL_GEN23_WHOLE_OFFLINE_V1', deadlineMs: 90_000,
      maxOutputBytes: 1024, strictGroupCleanup: true })
    try {
      assert.equal(result.status, 'EXITED')
      assert.equal(result.code, 0)
      const receipt = JSON.parse(result.output.toString('utf8'))
      assert.equal(receipt.status, 'PASS_PARTIAL_LOCAL_COMPOSITE')
      assert.equal(receipt.phaseCount, 12)
      assert.equal(receipt.previewWorker, 'real_worker_local_http_two_one_use_journals')
      assert.equal(receipt.hostedPreview, 'not_tested')
      assert.equal(receipt.purchase, 'none')
    } finally { result.output?.fill(0) }
  })
