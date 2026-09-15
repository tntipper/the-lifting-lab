import test from 'node:test'
import assert from 'node:assert/strict'
import { createConnection, createServer } from 'node:net'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { NETWORK, PROJECT, RELAYS, verifyRelayTarget, verifyLocalDockerEndpoint, openLoopbackRelay, startFixtureRelays } from './local-supabase/loopback-relay.mjs'

function fixture(spec = RELAYS[0]) {
  const networkId = 'a'.repeat(64), containerId = 'b'.repeat(64)
  return {
    network: {
      Name: NETWORK, Id: networkId, Driver: 'bridge', Scope: 'local', Internal: true,
      Labels: { 'com.tll.fixture': PROJECT },
      Options: { 'com.docker.network.bridge.host_binding_ipv4': '127.0.0.1' },
      IPAM: { Config: [{ Subnet: '172.28.0.0/16', Gateway: '172.28.0.1' }] },
      Containers: { [containerId]: { Name: spec.name, IPv4Address: '172.28.0.2/16' } },
    },
    container: {
      Id: containerId, Name: `/${spec.name}`, State: { Running: true },
      Config: { Labels: { 'com.supabase.cli.project': PROJECT } },
      NetworkSettings: {
        Networks: { [NETWORK]: { NetworkID: networkId, IPAddress: '172.28.0.2', IPPrefixLen: 16 } },
        Ports: { [`${spec.targetPort}/tcp`]: null },
      },
    },
  }
}

test('only the three configured services map to the expected private container ports', () => {
  assert.deepEqual(RELAYS.map(({ listenPort, targetPort }) => [listenPort, targetPort]), [[55522, 5432], [55521, 8443], [55524, 8025]])
  for (const spec of RELAYS) {
    const { network, container } = fixture(spec)
    assert.deepEqual(verifyRelayTarget(spec, network, container), { host: '172.28.0.2', port: spec.targetPort })
    assert.throws(() => verifyRelayTarget({ ...spec, targetPort: 1025 }, network, container), /Unknown relay/)
  }
})

for (const [label, mutate] of [
  ['wrong project label', ({ container }) => { container.Config.Labels['com.supabase.cli.project'] = 'other' }],
  ['wrong container name', ({ container }) => { container.Name = '/supabase_db_other' }],
  ['stopped container', ({ container }) => { container.State.Running = false }],
  ['additional container network', ({ container }) => { container.NetworkSettings.Networks.external = {} }],
  ['replaced network identity', ({ container }) => { container.NetworkSettings.Networks[NETWORK].NetworkID = 'c'.repeat(64) }],
  ['external network', ({ network }) => { network.Internal = false }],
  ['unowned network', ({ network }) => { network.Labels['com.tll.fixture'] = 'other' }],
  ['host network driver', ({ network }) => { network.Driver = 'host' }],
  ['network wildcard binding', ({ network }) => { network.Options['com.docker.network.bridge.host_binding_ipv4'] = '0.0.0.0' }],
  ['externally published container port', ({ container }) => { container.NetworkSettings.Ports['5432/tcp'] = [{ HostIp: '0.0.0.0', HostPort: '55522' }] }],
  ['missing network membership', ({ network }) => { network.Containers = {} }],
  ['mismatched member address', ({ network, container }) => { network.Containers[container.Id].IPv4Address = '172.28.0.3/16' }],
]) {
  test(`refuses ${label}`, () => {
    const data = fixture()
    mutate(data)
    assert.throws(() => verifyRelayTarget(RELAYS[0], data.network, data.container))
  })
}

for (const ip of ['127.0.0.1', '0.0.0.0', '169.254.169.254', '8.8.8.8', 'example.com', '::1', '172.29.0.2', '172.28.0.0', '172.28.255.255', '172.28.0.1']) {
  test(`refuses destination ${ip} even when both inspect records agree`, () => {
    const { network, container } = fixture()
    container.NetworkSettings.Networks[NETWORK].IPAddress = ip
    network.Containers[container.Id].IPv4Address = `${ip}/16`
    assert.throws(() => verifyRelayTarget(RELAYS[0], network, container))
  })
}

test('Docker Desktop mode opens no listeners and does not inspect Docker', async () => {
  for (const platform of ['darwin', 'win32']) await (await startFixtureRelays({ platform })).close()
})

test('Linux permits only a local Docker socket, including rootless Docker', () => {
  verifyLocalDockerEndpoint('unix:///var/run/docker.sock')
  verifyLocalDockerEndpoint('unix:///run/user/1000/docker.sock')
  for (const endpoint of ['tcp://127.0.0.1:2375', 'tcp://remote:2376', 'ssh://remote', 'unix://remote/socket', '', null]) {
    assert.throws(() => verifyLocalDockerEndpoint(endpoint), /local Unix-socket/)
  }
})

async function listen(server) {
  server.listen({ host: '127.0.0.1', port: 0 })
  await once(server, 'listening')
  return { host: '127.0.0.1', port: server.address().port }
}

test('loopback relay forwards binary traffic and half-closes without changing bytes', { timeout: 10000 }, async t => {
  const payload = Buffer.from(Array.from({ length: 256 * 1024 }, (_, i) => i % 256))
  const received = []
  const target = createServer({ allowHalfOpen: true }, socket => {
    socket.on('data', data => received.push(data))
    socket.on('end', () => socket.end(Buffer.concat(received)))
  })
  const targetAddress = await listen(target)
  t.after(() => new Promise(resolve => target.close(resolve)))
  const relay = await openLoopbackRelay({ listenPort: 0, resolveTarget: async () => targetAddress })
  t.after(() => relay.close())
  assert.equal(relay.address.address, '127.0.0.1')
  assert.equal(relay.address.family, 'IPv4')
  const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
  const response = []
  client.on('data', data => response.push(data))
  const ended = once(client, 'end')
  client.end(payload)
  await ended
  assert.deepEqual(Buffer.concat(received), payload)
  assert.deepEqual(Buffer.concat(response), payload)
})

test('rejected identity closes a connection without forwarding any data', { timeout: 10000 }, async t => {
  let failures = 0
  const relay = await openLoopbackRelay({ listenPort: 0, resolveTarget: () => { throw new Error('unowned target') }, onError: () => failures++ })
  t.after(() => relay.close())
  const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
  client.on('error', () => {})
  await new Promise(resolve => client.once('close', resolve))
  assert.equal(failures, 1)
})

test('cleanup closes an active relay and releases its listening port', { timeout: 10000 }, async t => {
  const target = createServer(socket => { socket.on('error', () => {}); socket.resume() })
  const targetAddress = await listen(target)
  t.after(() => new Promise(resolve => target.close(resolve)))
  const relay = await openLoopbackRelay({ listenPort: 0, resolveTarget: async () => targetAddress })
  const incoming = once(target, 'connection')
  const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
  client.on('error', () => {})
  await incoming
  const closed = new Promise(resolve => client.once('close', resolve))
  await relay.close()
  await closed
  await relay.close() // Cleanup is safe to repeat after an earlier failure.
  const replacement = await openLoopbackRelay({ listenPort: relay.address.port, resolveTarget: async () => targetAddress })
  await replacement.close()
})

test('an occupied listener is rejected, never silently reused', { timeout: 10000 }, async t => {
  const occupied = createServer()
  const address = await listen(occupied)
  t.after(() => new Promise(resolve => occupied.close(resolve)))
  await assert.rejects(openLoopbackRelay({ listenPort: address.port, resolveTarget: async () => address }), { code: 'EADDRINUSE' })
})

test('fixture runner opens relays before CLI start and closes them before stop', async () => {
  const source = await readFile(new URL('./local-supabase/run-local.mjs', import.meta.url), 'utf8')
  assert.ok(source.indexOf('relays = await startFixtureRelays()') < source.indexOf("await cli(['start'"))
  assert.ok(source.indexOf('await relays?.close()') < source.indexOf("await cli(['stop'"))
  const acceptance = await readFile(new URL('./local-supabase/auth-storage.test.mjs', import.meta.url), 'utf8')
  assert.match(acceptance, /ca: certificate/)
  assert.doesNotMatch(acceptance, /rejectUnauthorized:\s*false/)
})

test('cleanup while identity resolution is pending cannot open a later upstream socket', { timeout: 10000 }, async t => {
  let resolveTarget, resolving
  const targetReady = new Promise(resolve => { resolving = resolve })
  const pending = new Promise(resolve => { resolveTarget = resolve })
  let upstreamConnections = 0
  const target = createServer(socket => { upstreamConnections++; socket.destroy() })
  const targetAddress = await listen(target)
  t.after(() => new Promise(resolve => target.close(resolve)))
  const relay = await openLoopbackRelay({ listenPort: 0, resolveTarget: () => { resolving(); return pending } })
  const client = createConnection({ host: '127.0.0.1', port: relay.address.port })
  client.on('error', () => {})
  const closed = new Promise(resolve => client.once('close', resolve))
  await targetReady
  await relay.close()
  resolveTarget(targetAddress)
  await closed
  assert.equal(upstreamConnections, 0)
})
