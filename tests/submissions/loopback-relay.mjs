// Linux Docker 28 does not publish host ports for internal bridge networks.
// Keep that isolation and relay only to this run's verified PostgREST container.
import assert from 'node:assert/strict'
import { createServer, createConnection, isIPv4 } from 'node:net'

export const FIXTURE_LABEL = 'uk.co.theliftinglab.submission-ci'
const privateIPv4 = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/
const ipNumber = ip => {
  assert.ok(isIPv4(ip), 'Expected a literal IPv4 address')
  return ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0)
}
export function verifySubmissionRelayTarget(runId, network, container) {
  assert.match(runId, /^[a-f0-9]{12}$/, 'Invalid synthetic run identity')
  const networkName = `tll-submission-ci-network-${runId}`
  const containerName = `tll-submission-ci-postgrest-${runId}`
  assert.equal(network.Name, networkName, 'Unexpected network name')
  assert.equal(network.Driver, 'bridge', 'Expected a Docker bridge')
  assert.equal(network.Scope, 'local', 'Expected a local Docker network')
  assert.equal(network.Internal, true, 'Network must remain internal')
  assert.equal(network.Labels?.[FIXTURE_LABEL], runId, 'Network is not task-owned')
  assert.match(network.Id, /^[a-f0-9]{64}$/, 'Invalid network identity')
  assert.equal(container.Name, `/${containerName}`, 'Unexpected container name')
  assert.equal(container.Config?.Labels?.[FIXTURE_LABEL], runId, 'Container is not task-owned')
  assert.equal(container.State?.Running, true, 'Container is not running')
  assert.match(container.Id, /^[a-f0-9]{64}$/, 'Invalid container identity')
  assert.deepEqual(Object.keys(container.NetworkSettings?.Networks ?? {}), [networkName], 'Container must use only the task network')
  const endpoint = container.NetworkSettings.Networks[networkName]
  assert.equal(endpoint.NetworkID, network.Id, 'Container network identity differs')
  const ip = endpoint.IPAddress, value = ipNumber(ip)
  assert.ok(privateIPv4.test(ip), 'Target must be a private bridge address')
  const membership = network.Containers?.[container.Id]
  assert.equal(membership?.Name, containerName, 'Container is absent from network membership')
  assert.equal(membership?.IPv4Address, `${ip}/${endpoint.IPPrefixLen}`, 'Container IP differs from network membership')
  assert.ok(network.IPAM?.Config?.some(({ Subnet, Gateway }) => {
    if (typeof Subnet !== 'string') return false
    const [base, prefixText, extra] = Subnet.split('/')
    if (extra !== undefined || !isIPv4(base) || !/^(\d|[12]\d|30)$/.test(prefixText)) return false
    const prefix = Number(prefixText)
    if (prefix < 8 || prefix !== endpoint.IPPrefixLen) return false
    const size = 2 ** (32 - prefix), start = ipNumber(base)
    return start % size === 0 && value > start && value < start + size - 1 && ip !== Gateway
  }), 'Target is not a usable host in the verified subnet')
  for (const bindings of [container.NetworkSettings?.Ports, container.HostConfig?.PortBindings]) {
    for (const entries of Object.values(bindings ?? {})) assert.ok(entries === null || Array.isArray(entries) && entries.length === 0, 'Fixture must not publish Docker ports')
  }
  return Object.freeze({ host: ip, port: 3000 })
}

// A transport primitive, separately testable using synthetic loopback servers.
// Only the verified wrapper below resolves a Docker destination.
export async function openSubmissionRelay(resolveTarget, onError = () => {}) {
  const sockets = new Set()
  let closed = false, closePromise
  const server = createServer({ pauseOnConnect: true, allowHalfOpen: true }, downstream => {
    sockets.add(downstream)
    let upstream, timer
    const fail = () => { clearTimeout(timer); downstream.destroy(); upstream?.destroy() }
    downstream.on('error', fail)
    downstream.on('close', () => { sockets.delete(downstream); fail() })
    downstream.setTimeout(15000, fail)
    timer = setTimeout(fail, 5000)
    Promise.resolve().then(resolveTarget).then(target => {
      if (closed || downstream.destroyed) return
      upstream = createConnection({ ...target, allowHalfOpen: true })
      sockets.add(upstream)
      upstream.setTimeout(15000, fail)
      upstream.on('error', () => { onError(); fail() })
      upstream.on('close', () => { sockets.delete(upstream); if (!upstream.readableEnded) fail() })
      upstream.once('connect', () => {
        clearTimeout(timer)
        downstream.pipe(upstream)
        upstream.pipe(downstream)
        downstream.resume()
      })
    }).catch(() => { onError(); fail() })
  })
  server.maxConnections = 32
  const close = () => {
    if (closePromise) return closePromise
    closed = true
    closePromise = new Promise(resolve => {
      server.close(resolve)
      for (const socket of sockets) socket.destroy()
    })
    return closePromise
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve)
    })
  } catch (error) { await close(); throw error }
  return { address: server.address(), close }
}

export async function startSubmissionRelay({ runId, endpoint, docker, platform = process.platform, onError = () => {} }) {
  assert.equal(platform, 'linux', 'The bridge relay requires Linux Docker')
  assert.ok(typeof endpoint === 'string' && /^unix:\/\/\/[^\0\r\n]+$/.test(endpoint), 'The bridge relay requires a local Unix Docker endpoint')
  assert.match(runId, /^[a-f0-9]{12}$/, 'Invalid synthetic run identity')
  const read = async args => {
    // Do not log inspect output: Config can contain synthetic credentials.
    const parsed = JSON.parse(await docker(args, { timeout: 5000 }))
    assert.ok(Array.isArray(parsed) && parsed.length === 1, 'Expected one Docker object')
    return parsed[0]
  }
  const inspect = async () => {
    const [network, container] = await Promise.all([
      read(['network', 'inspect', `tll-submission-ci-network-${runId}`]),
      read(['container', 'inspect', `tll-submission-ci-postgrest-${runId}`]),
    ])
    return { target: verifySubmissionRelayTarget(runId, network, container), networkId: network.Id, containerId: container.Id }
  }
  // Reject unsafe state before opening a listener. Recheck before EACH upstream
  // connection, including identity equality so replacement cannot retarget it.
  const original = await inspect()
  return openSubmissionRelay(async () => {
    const current = await inspect()
    assert.equal(current.networkId, original.networkId, 'Relay network was replaced')
    assert.equal(current.containerId, original.containerId, 'Relay container was replaced')
    assert.deepEqual(current.target, original.target, 'Relay destination changed')
    return current.target
  }, onError)
}
