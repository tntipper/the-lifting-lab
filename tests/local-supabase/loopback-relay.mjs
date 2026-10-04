// Docker 28 does not publish ports on an internal-only network. The Linux
// host can reach its bridge IPs directly; Docker Desktop hosts cannot.
import assert from 'node:assert/strict'
import { createServer, createConnection, isIPv4 } from 'node:net'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
export const PROJECT = 'tll-local-integration'
export const NETWORK = `${PROJECT}-net`
export const RELAYS = Object.freeze([
  Object.freeze({ name: `supabase_db_${PROJECT}`, listenPort: 55522, targetPort: 5432 }),
  Object.freeze({ name: `supabase_kong_${PROJECT}`, listenPort: 55521, targetPort: 8443 }),
  Object.freeze({ name: `supabase_inbucket_${PROJECT}`, listenPort: 55524, targetPort: 8025 }),
])

function ipv4Number(ip) {
  assert.ok(isIPv4(ip), 'Expected a literal IPv4 address')
  return ip.split('.').reduce((value, octet) => value * 256 + Number(octet), 0)
}

export function verifyRelayTarget(spec, network, container) {
  assert.ok(RELAYS.includes(spec), 'Unknown relay service')
  assert.equal(network.Name, NETWORK, 'Unexpected network name')
  assert.equal(network.Driver, 'bridge', 'Expected a Docker bridge')
  assert.equal(network.Scope, 'local', 'Expected a local Docker network')
  assert.equal(network.Internal, true, 'Network must remain internal')
  assert.equal(network.Labels?.['com.tll.fixture'], PROJECT, 'Network is not fixture-owned')
  assert.equal(network.Options?.['com.docker.network.bridge.host_binding_ipv4'], '127.0.0.1', 'Unsafe network bind address')
  assert.match(network.Id, /^[a-f0-9]{64}$/, 'Invalid network identity')
  assert.equal(container.Name, `/${spec.name}`, 'Unexpected container name')
  assert.equal(container.Config?.Labels?.['com.supabase.cli.project'], PROJECT, 'Container is not fixture-owned')
  assert.equal(container.State?.Running, true, 'Container is not running')
  assert.match(container.Id, /^[a-f0-9]{64}$/, 'Invalid container identity')
  assert.deepEqual(Object.keys(container.NetworkSettings?.Networks ?? {}), [NETWORK], 'Container must use only the fixture network')
  const endpoint = container.NetworkSettings.Networks[NETWORK]
  assert.equal(endpoint.NetworkID, network.Id, 'Container belongs to a different network identity')
  const ip = endpoint.IPAddress
  const value = ipv4Number(ip)
  assert.ok(/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.)/.test(ip), 'Target must be a private bridge address')
  const membership = network.Containers?.[container.Id]
  assert.equal(membership?.Name, spec.name, 'Container is absent from network membership')
  assert.equal(membership?.IPv4Address, `${ip}/${endpoint.IPPrefixLen}`, 'Container IP differs from network membership')
  assert.ok(network.IPAM?.Config?.some(({ Subnet, Gateway }) => {
    if (typeof Subnet !== 'string') return false
    const [base, prefixText, extra] = Subnet.split('/')
    if (extra !== undefined || !isIPv4(base) || !/^(\d|[12]\d|30)$/.test(prefixText)) return false
    const prefix = Number(prefixText)
    if (prefix < 8 || prefix !== endpoint.IPPrefixLen) return false
    const size = 2 ** (32 - prefix)
    const start = ipv4Number(base)
    return start % size === 0 && value > start && value < start + size - 1 && ip !== Gateway
  }), 'Target is not a usable address in the verified network subnet')
  for (const bindings of Object.values(container.NetworkSettings.Ports ?? {})) {
    for (const binding of bindings ?? []) assert.equal(binding.HostIp, '127.0.0.1', 'Container has an externally published port')
  }
  return { host: ip, port: spec.targetPort }
}

async function inspect(args) {
  // Keep Docker's full inspect result private: it can include local credentials.
  const { stdout } = await execFileAsync('docker', args, { encoding: 'utf8', timeout: 3000, maxBuffer: 2 * 1024 * 1024 })
  return JSON.parse(stdout)[0]
}

async function resolveTarget(spec) {
  const [network, container] = await Promise.all([
    inspect(['network', 'inspect', NETWORK]),
    inspect(['inspect', '--type', 'container', spec.name]),
  ])
  return verifyRelayTarget(spec, network, container)
}

export function verifyLocalDockerEndpoint(endpoint) {
  assert.ok(typeof endpoint === 'string' && /^unix:\/\/\/[^\0\r\n]+$/.test(endpoint), 'Linux relay requires a local Unix-socket Docker daemon')
}

// Transport primitive is separate so lifecycle/backpressure can be tested
// against synthetic loopback sockets without Docker or external connections.
export async function openLoopbackRelay({ listenPort, resolveTarget, onError = () => {} }) {
  const sockets = new Set()
  let closed = false
  const server = createServer({ pauseOnConnect: true, allowHalfOpen: true }, downstream => {
    sockets.add(downstream)
    let upstream
    let timer
    const fail = () => {
      clearTimeout(timer)
      downstream.destroy()
      upstream?.destroy()
    }
    downstream.on('error', fail)
    downstream.on('close', () => { sockets.delete(downstream); fail() })
    timer = setTimeout(fail, 5000)
    Promise.resolve().then(resolveTarget).then(target => {
      if (closed || downstream.destroyed) return
      // No HTTP/TLS handling: clients authenticate the original Kong server.
      upstream = createConnection({ ...target, allowHalfOpen: true })
      sockets.add(upstream)
      upstream.on('error', () => { onError(); fail() })
      upstream.on('close', () => {
        sockets.delete(upstream)
        // A normal EOF must let downstream's queued bytes drain first.
        if (!upstream.readableEnded) fail()
      })
      upstream.once('connect', () => {
        clearTimeout(timer)
        downstream.pipe(upstream)
        upstream.pipe(downstream)
        downstream.resume()
      })
    }).catch(() => { onError(); fail() })
  })
  const close = async () => {
    closed = true
    const stopped = new Promise(resolve => server.close(resolve))
    for (const socket of sockets) socket.destroy()
    await stopped
  }
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject)
      server.listen({ host: '127.0.0.1', port: listenPort, exclusive: true }, resolve)
    })
  } catch (error) { await close(); throw error }
  return { address: server.address(), close }
}

export async function startFixtureRelays({ platform = process.platform } = {}) {
  const relays = []
  const close = async () => { await Promise.all(relays.map(relay => relay.close())) }
  if (platform !== 'linux') return { close }
  // A remote daemon's bridge address may identify an unrelated local host.
  // DOCKER_CONTEXT overrides DOCKER_HOST in the Docker CLI.
  if (process.env.DOCKER_HOST && !process.env.DOCKER_CONTEXT) verifyLocalDockerEndpoint(process.env.DOCKER_HOST)
  else {
    const { stdout } = await execFileAsync('docker', ['context', 'inspect', '--format', '{{json .Endpoints.docker.Host}}'], { encoding: 'utf8', timeout: 3000 })
    verifyLocalDockerEndpoint(JSON.parse(stdout))
  }
  // Refuse an unrelated or non-isolated network before opening any listener.
  const network = await inspect(['network', 'inspect', NETWORK])
  assert.equal(network.Internal, true, 'Fixture relay requires an internal Docker network')
  assert.equal(network.Labels?.['com.tll.fixture'], PROJECT, 'Fixture relay requires its own Docker network')
  try {
    for (const spec of RELAYS) {
      relays.push(await openLoopbackRelay({
        listenPort: spec.listenPort,
        resolveTarget: () => resolveTarget(spec),
        onError: () => console.error(`Dedicated local relay ${spec.listenPort} could not reach its verified container.`),
      }))
    }
  } catch (error) { await close(); throw error }
  return { close }
}
