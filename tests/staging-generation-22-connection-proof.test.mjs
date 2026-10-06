import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createStagingGeneration22ConnectionProof } from '../scripts/staging-generation-22-connection-proof.mjs'

const expiry = '2026-09-26T10:50:00.000Z'
const now = () => Date.parse('2026-09-26T10:00:00.000Z')
const passwords = Object.fromEntries(['customer', 'cart', 'broker', 'provisional', 'bridge']
  .map((purpose, index) => [purpose, String(index).repeat(64)]))
async function armed() {
  const scripts = new URL('../scripts/', import.meta.url)
  const credentials = (await readFile(new URL('staging-generation-22-credentials.mjs', scripts), 'utf8'))
    .replace("export const ACTIVE_WINDOW_EXPIRES_AT = 'UNSET_REQUIRES_REVIEWED_ARMING_DIFF'",
      `export const ACTIVE_WINDOW_EXPIRES_AT = '${expiry}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  const credentialUrl = `data:text/javascript;base64,${Buffer.from(credentials).toString('base64')}`
  const source = (await readFile(new URL('staging-generation-22-connection-proof.mjs', scripts), 'utf8'))
    .replace('export const STAGING_GENERATION_22_CONNECTION_PROOF_ENABLED = false',
      'export const STAGING_GENERATION_22_CONNECTION_PROOF_ENABLED = true')
    .replace("from './staging-generation-22-credentials.mjs'", `from '${credentialUrl}'`)
    .replaceAll("from './", `from '${scripts.href}`)
  return (await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`))
    .createStagingGeneration22ConnectionProof
}

test('connection proof is disabled before any CA or database access', () => {
  let accessed = false
  assert.throws(() => createStagingGeneration22ConnectionProof({
    createRuntime() { accessed = true }, readCa() { accessed = true },
  }), /unavailable/)
  assert.equal(accessed, false)
})

test('only exact five-role result after verifier drain becomes PASS_DRAINED', async () => {
  const create = await armed(), calls = []
  const proof = create({ createRuntime() { calls.push('runtime') },
    readCa() { calls.push('ca'); return { pem: 'fixture', sha256: 'a'.repeat(64) } },
    async verify(input) {
      calls.push('verify')
      assert.equal(input.passwords, passwords)
      assert.equal(input.expiresAt, expiry)
      assert.equal(input.tlsCa.pem, 'fixture')
      return { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme',
        purposes: 5, controlsEnabled: false }
    }, now })
  assert.deepEqual(await proof.prove({ passwords, expiresAt: expiry,
    signal: new AbortController().signal }), {
    status: 'PASS_DRAINED', projectRef: 'qdmvngjwkcsilzmqksme',
    purposes: 5, controlsEnabled: false })
  assert.deepEqual(calls, ['ca', 'verify'])
  await assert.rejects(proof.prove({ passwords, expiresAt: expiry,
    signal: new AbortController().signal }), /unavailable/)
})

test('aborted or malformed verifier response cannot become drained proof', async () => {
  const create = await armed()
  for (const result of [
    { status: 'PASS', projectRef: 'wrong', purposes: 5, controlsEnabled: false },
    { status: 'PASS', projectRef: 'qdmvngjwkcsilzmqksme', purposes: 4, controlsEnabled: false },
  ]) {
    const proof = create({ createRuntime() {}, readCa: () => ({}), verify: async () => result, now })
    await assert.rejects(proof.prove({ passwords, expiresAt: expiry,
      signal: new AbortController().signal }), /unavailable/)
  }
  const parent = new AbortController()
  const proof = create({ createRuntime() {}, readCa: () => ({}),
    verify: async () => { parent.abort(); return { status: 'PASS',
      projectRef: 'qdmvngjwkcsilzmqksme', purposes: 5, controlsEnabled: false } }, now })
  await assert.rejects(proof.prove({ passwords, expiresAt: expiry,
    signal: parent.signal }), /unavailable/)
})
