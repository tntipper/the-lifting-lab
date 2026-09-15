// Temporary release proof client. Reads the reviewed preview context/credential
// from stdin, never command-line arguments, URLs, output or a committed file.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const SPOOF_CASES = [
  ['generic-forwarding', { 'x-forwarded-for': '192.0.2.1', 'x-real-ip': '198.51.100.2', forwarded: 'for=203.0.113.3' }],
  ['trusted-test-net-1', { 'x-vercel-forwarded-for': '192.0.2.1' }],
  ['trusted-test-net-2', { 'x-vercel-forwarded-for': '198.51.100.2' }],
  ['trusted-test-net-3', { 'x-vercel-forwarded-for': '203.0.113.3' }],
  ['trusted-ipv6', { 'x-vercel-forwarded-for': '2001:db8::4' }],
  ['trusted-ambiguous', { 'x-vercel-forwarded-for': '192.0.2.1, 198.51.100.2' }],
  ['all-forwarding', { 'x-vercel-forwarded-for': '192.0.2.1', 'x-forwarded-for': '198.51.100.2',
    'x-real-ip': '203.0.113.3', forwarded: 'for="[2001:db8::4]"', 'cf-connecting-ip': '192.0.2.1', 'true-client-ip': '198.51.100.2' }],
]

export async function runIpProof(config, transport = fetch) {
  let origin
  try {
    const url = new URL(config.origin)
    // This is an explicit operator binding, not independent deployment metadata
    // attestation. The operator must verify the exact preview deployment first.
    if (url.protocol !== 'https:' || !url.hostname.endsWith('.vercel.app') || url.port || url.username || url.password
      || url.pathname !== '/' || url.search || url.hash || config.verifiedEnvironment !== 'hosted-staging-preview'
      || !/^[a-f0-9]{64}$/.test(config.keyHex) || !/^[a-f0-9]{32}$/.test(config.runId)) throw new Error()
    origin = url.origin
  } catch { throw new Error('A verified hosted staging Vercel preview origin and proof configuration are required') }
  const target = `${origin}/api/staging/ip-proof`
  const headers = { 'x-tll-ip-proof-key': config.keyHex, 'x-tll-ip-proof-run': config.runId }
  // Reuse only an already-authorized deployment-protection credential, if needed.
  // This script never creates a Vercel bypass token, session or cookie.
  if (config.deploymentProtectionBypass !== undefined) {
    if (typeof config.deploymentProtectionBypass !== 'string' || !config.deploymentProtectionBypass
      || /[\r\n]/.test(config.deploymentProtectionBypass)) throw new Error('Invalid deployment protection configuration')
    headers['x-vercel-protection-bypass'] = config.deploymentProtectionBypass
  }
  async function request(label, extra = {}, includeProofKey = true, expectedStatus = 200) {
    try {
      const sent = { ...headers, ...extra }
      if (!includeProofKey) delete sent['x-tll-ip-proof-key']
      const response = await transport(target, { method: 'GET', headers: sent, redirect: 'error',
        cache: 'no-store', signal: AbortSignal.timeout(15000) })
      if (response.status !== expectedStatus) throw new Error()
      if (expectedStatus === 404) { await response.body?.cancel(); return null }
      if (!response.headers.get('content-type')?.includes('application/json')
        || !response.headers.get('cache-control')?.includes('no-store')) throw new Error()
      const reader = response.body.getReader(), chunks = []
      let size = 0
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          size += value.byteLength
          if (size > 1024) { await reader.cancel(); throw new Error() }
          chunks.push(value)
        }
      } finally { reader.releaseLock() }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
      if (Object.keys(result).sort().join(',') !== 'fingerprint,matches_documentation_spoof'
        || typeof result.matches_documentation_spoof !== 'boolean' || !/^[a-f0-9]{64}$/.test(result.fingerprint)) throw new Error()
      return result
    } catch { throw new Error(`Staging IP proof could not verify ${label}; response and credential details suppressed`) }
  }
  await request('missing-key-404', {}, false, 404)
  await request('wrong-key-404', { 'x-tll-ip-proof-key': config.keyHex === '00'.repeat(32) ? '11'.repeat(32) : '00'.repeat(32) }, true, 404)
  const cases = []
  for (const [name, spoof] of SPOOF_CASES) {
    const before = await request(`${name}:baseline-before`)
    const probe = await request(name, spoof)
    const after = await request(`${name}:baseline-after`)
    if (before.matches_documentation_spoof || probe.matches_documentation_spoof || after.matches_documentation_spoof) {
      throw new Error(`Staging IP proof failed: ${name} reached the trusted parser as a documentation address`)
    }
    if (before.fingerprint !== after.fingerprint) throw new Error(`Staging IP proof inconclusive: ${name} baseline changed; use stable egress and repeat`)
    if (before.fingerprint !== probe.fingerprint) throw new Error(`Staging IP proof failed: ${name} changed the trusted identity fingerprint`)
    cases.push({ name, fingerprint: before.fingerprint, unchanged: true })
  }
  return { status: 'pass', proof_version: 1, cases, limitations: ['One verified preview origin and egress path only; custom production proxy topology requires separate acceptance'] }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const input = readFileSync(0, 'utf8')
    if (input.length > 8192) throw new Error('Invalid proof input')
    const report = await runIpProof(JSON.parse(input))
    console.log(JSON.stringify(report, null, 2))
  } catch (error) {
    // Only messages deliberately constructed by this file may reach output.
    console.error(error instanceof Error && error.message.startsWith('Staging IP proof')
      ? error.message : 'Staging IP proof configuration failed; input details suppressed')
    process.exitCode = 1
  }
}
