import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, createConnection } from 'node:net'
import { once } from 'node:events'
import { FIXTURE_LABEL, verifySubmissionRelayTarget, openSubmissionRelay, startSubmissionRelay } from './loopback-relay.mjs'

const runId = '123abc456def', networkName = `tll-submission-ci-network-${runId}`, containerName = `tll-submission-ci-postgrest-${runId}`
function state() {
  const network = { Name: networkName, Driver: 'bridge', Scope: 'local', Internal: true, Id: 'a'.repeat(64), Labels: { [FIXTURE_LABEL]: runId }, Containers: { ['b'.repeat(64)]: { Name: containerName, IPv4Address: '172.29.0.2/16' } }, IPAM: { Config: [{ Subnet: '172.29.0.0/16', Gateway: '172.29.0.1' }] } }
  const container = { Name: '/' + containerName, Id: 'b'.repeat(64), Config: { Labels: { [FIXTURE_LABEL]: runId } }, State: { Running: true }, HostConfig: { PortBindings: {} }, NetworkSettings: { Networks: { [networkName]: { NetworkID: network.Id, IPAddress: '172.29.0.2', IPPrefixLen: 16 } }, Ports: { '3000/tcp': null } } }
  return { network, container }
}
test('relay targets only the exact running task PostgREST member on its private internal bridge', () => {
  const { network, container } = state()
  assert.deepEqual(verifySubmissionRelayTarget(runId, network, container), { host: '172.29.0.2', port: 3000 })
})
for (const [label, mutate] of [
  ['wrong run label', ({ network }) => { network.Labels[FIXTURE_LABEL] = 'other' }],
  ['non-internal network', ({ network }) => { network.Internal = false }],
  ['wrong bridge driver', ({ network }) => { network.Driver = 'host' }],
  ['remote network scope', ({ network }) => { network.Scope = 'swarm' }],
  ['wrong network name', ({ network }) => { network.Name = 'other' }],
  ['wrong container name', ({ container }) => { container.Name = '/other' }],
  ['wrong container owner', ({ container }) => { container.Config.Labels[FIXTURE_LABEL] = 'other' }],
  ['stopped container', ({ container }) => { container.State.Running = false }],
  ['additional external network', ({ container }) => { container.NetworkSettings.Networks.other = {} }],
  ['mismatched network identity', ({ container }) => { container.NetworkSettings.Networks[networkName].NetworkID = 'c'.repeat(64) }],
  ['absent network membership', ({ network }) => { network.Containers = {} }],
  ['mismatched membership IP', ({ network }) => { network.Containers['b'.repeat(64)].IPv4Address = '172.29.0.3/16' }],
  ['public address', ({ container }) => { container.NetworkSettings.Networks[networkName].IPAddress = '8.8.8.8' }],
  ['loopback target', ({ container }) => { container.NetworkSettings.Networks[networkName].IPAddress = '127.0.0.1' }],
  ['hostname target', ({ container }) => { container.NetworkSettings.Networks[networkName].IPAddress = 'example.test' }],
  ['other subnet', ({ network }) => { network.IPAM.Config[0].Subnet = '172.30.0.0/16' }],
  ['gateway target', ({ network }) => { network.IPAM.Config[0].Gateway = '172.29.0.2' }],
  ['configured Docker publish', ({ container }) => { container.HostConfig.PortBindings = { '3000/tcp': [{ HostIp: '127.0.0.1', HostPort: '45678' }] } }],
  ['actual Docker publish', ({ container }) => { container.NetworkSettings.Ports['3000/tcp'] = [{ HostIp: '0.0.0.0', HostPort: '45678' }] }],
]) test(`unsafe relay target rejected: ${label}`, () => {
  const value = state(); mutate(value)
  assert.throws(() => verifySubmissionRelayTarget(runId, value.network, value.container))
})
const listen = async handler => {
  const server = createServer({ allowHalfOpen: true }, handler)
  server.listen({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  return server
}
const closeServer = server => new Promise(resolve => server.close(resolve))
function exchange(port, body) {
  return new Promise((resolve, reject) => {
    const client = createConnection({ host: '127.0.0.1', port }), chunks = []
    client.setTimeout(5000, () => client.destroy(new Error('Synthetic relay exchange timed out')))
    client.on('error', reject)
    client.on('data', data => chunks.push(data))
    client.on('end', () => resolve(Buffer.concat(chunks)))
    client.on('connect', () => client.end(body))
  })
}
test('actual loopback relay preserves large data and half-close with bounded socket cleanup', { timeout: 10000 }, async () => {
  const server = await listen(socket => socket.pipe(socket))
  let resolutions = 0
  const relay = await openSubmissionRelay(async () => { resolutions++; return { host: '127.0.0.1', port: server.address().port } })
  try {
    assert.equal(relay.address.address, '127.0.0.1')
    assert.ok(relay.address.port >= 1024)
    const payload = Buffer.alloc(2 * 1024 * 1024, 'a')
    assert.deepEqual(await exchange(relay.address.port, payload), payload)
    assert.deepEqual(await exchange(relay.address.port, Buffer.from('second synthetic connection')), Buffer.from('second synthetic connection'))
    assert.equal(resolutions, 2)
  } finally { await relay.close(); await relay.close(); await closeServer(server) }
})
test('closing the relay destroys active upstream/downstream sockets and its listener', { timeout: 5000 }, async () => {
  const serverSockets = new Set()
  let accepted
  const connected = new Promise(resolve => { accepted = resolve })
  const server = await listen(socket => { serverSockets.add(socket); socket.once('close', () => serverSockets.delete(socket)); socket.on('end', () => socket.end()); accepted() })
  const relay = await openSubmissionRelay(async () => ({ host: '127.0.0.1', port: server.address().port }))
  const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
  client.on('error', () => {})
  try {
    await connected
    const closed = once(client, 'close')
    await relay.close(); await closed
    assert.equal(client.destroyed, true)
    await closeServer(server)
    assert.equal(serverSockets.size, 0)
    await assert.rejects(exchange(relay.address.port, Buffer.from('closed')), /ECONNREFUSED/)
  } finally { client.destroy(); await relay.close(); for (const socket of serverSockets) socket.destroy(); if (server.listening) await closeServer(server) }
})
test('changed container identity is rejected before any upstream connection', { timeout: 5000 }, async () => {
  let current = state(), inspections = 0, errors = 0
  const docker = async args => {
    inspections++
    return JSON.stringify([args[0] === 'network' ? current.network : current.container])
  }
  const relay = await startSubmissionRelay({ runId, endpoint: 'unix:///var/run/docker.sock', docker, platform: 'linux', onError: () => { errors++ } })
  try {
    assert.equal(inspections, 2)
    const member = current.network.Containers[current.container.Id]
    current.container.Id = 'c'.repeat(64)
    current.network.Containers = { [current.container.Id]: member }
    const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
    client.on('error', () => {})
    await once(client, 'close')
    assert.equal(errors, 1)
    assert.equal(inspections, 4)
  } finally { await relay.close() }
})
test('relay refuses remote Docker endpoints and non-Linux before inspecting or listening', async () => {
  let calls = 0
  const docker = async () => { calls++; throw new Error('must not inspect') }
  for (const endpoint of ['ssh://remote', 'tcp://127.0.0.1:2375', 'unix://relative']) await assert.rejects(startSubmissionRelay({ runId, endpoint, docker, platform: 'linux' }))
  await assert.rejects(startSubmissionRelay({ runId, endpoint: 'unix:///var/run/docker.sock', docker, platform: 'darwin' }))
  assert.equal(calls, 0)
})
test('unsafe initial inspection rejects before opening a listener', async () => {
  const { network, container } = state()
  container.State.Running = false
  await assert.rejects(startSubmissionRelay({ runId, endpoint: 'unix:///var/run/docker.sock', platform: 'linux', docker: async args => JSON.stringify([args[0] === 'network' ? network : container]) }), /not running/)
})
