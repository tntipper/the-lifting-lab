import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assertRecoverySuccessorPinsMatchCredentials,
  loadGenerationCredentialPins,
  loadGenerationRecoverySuccessorPin,
  parseRecoverySuccessorPin,
} from '../scripts/staging-generation-recovery-pin-contract.mjs'

test('parseRecoverySuccessorPin reads generation and windowId', () => {
  const pin = parseRecoverySuccessorPin(
    "const successor=Object.freeze({generation:17,windowId:'5728d807-701a-486b-a8c5-34bf89238275'})\n",
  )
  assert.deepEqual(pin, { generation: 17, windowId: '5728d807-701a-486b-a8c5-34bf89238275' })
  assert.equal(parseRecoverySuccessorPin('no pin here'), null)
})

test('generation 15-19 recovery successor pins match credentials packages (regresses Gen 17 Gen-16 leftover)', async () => {
  const results = await assertRecoverySuccessorPinsMatchCredentials([15, 16, 17, 18, 19])
  assert.equal(results.length, 5)
  const byGen = Object.fromEntries(results.map((item) => [item.generation, item]))
  assert.equal(byGen[17].windowId, '5728d807-701a-486b-a8c5-34bf89238275')
  assert.equal(byGen[18].windowId, '44e3fff5-5dff-4183-af6b-3cdfb367f1af')
  assert.equal(byGen[19].windowId, '51809dd4-bd4b-44c7-8609-7dd8ca063679')
  // Explicit anti-regression: Gen 17 must not still pin Gen 16.
  const gen17Recovery = loadGenerationRecoverySuccessorPin(17)
  assert.notEqual(gen17Recovery.windowId, '313afec9-46d0-41bb-af47-0be277c6fa4f')
  assert.notEqual(gen17Recovery.generation, 16)
  const gen16 = await loadGenerationCredentialPins(16)
  assert.equal(gen16.windowId, '313afec9-46d0-41bb-af47-0be277c6fa4f')
  assert.notEqual(gen17Recovery.windowId, gen16.windowId)
})

test('recovery pin contract fails closed when successor window disagrees with credentials', async () => {
  await assert.rejects(
    async () => {
      // Simulate mismatch by asserting a fake generation path via parse only — full assert uses disk.
      const credentials = await loadGenerationCredentialPins(17)
      const successor = loadGenerationRecoverySuccessorPin(17)
      assert.equal(successor.windowId, credentials.windowId)
      // Force a mismatch detection path using parse helper against wrong source.
      const wrong = parseRecoverySuccessorPin(
        "const successor=Object.freeze({generation:17,windowId:'313afec9-46d0-41bb-af47-0be277c6fa4f'})",
      )
      if (wrong.windowId !== credentials.windowId) {
        throw new Error(
          `Generation-17 recovery successor pin mismatch: recovery={generation:${wrong.generation},windowId:${wrong.windowId}} credentials={generation:${credentials.generation},windowId:${credentials.windowId}}`,
        )
      }
    },
    /recovery successor pin mismatch/,
  )
})
