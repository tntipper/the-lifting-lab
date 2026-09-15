import test from 'node:test'
import assert from 'node:assert/strict'
import { fixtureTarget } from './fixture.mjs'
import { dumpFingerprint, verifyReplay } from './verify-replay.mjs'
import { namesFor, validateArguments, localEndpoint, runAcceptance } from './run-local.mjs'

const id = '123abc456def', names = namesFor(id)
test('runner rejects non-Linux execution and custom targets before side effects', () => {
  assert.throws(() => validateArguments([], 'darwin'), /Linux/)
  for (const input of [['--database-url', 'https://example.test'], ['--keep'], ['--plan', 'extra']]) assert.throws(() => validateArguments(input, 'linux'))
  assert.equal(validateArguments(['--help'], 'darwin'), '--help')
  assert.equal(validateArguments(['--plan'], 'darwin'), '--plan')
  assert.equal(validateArguments([], 'linux'), 'run')
})
test('fixture accepts only generated container names and numeric loopback ports', () => {
  assert.equal(fixtureTarget({}).database, 'tll_submission_test')
  assert.equal(fixtureTarget({ TLL_SUBMISSION_TEST_CONTAINER: names.postgres, TLL_SUBMISSION_HTTP_PORT: '40000' }).origin, 'http://127.0.0.1:40000')
  for (const container of ['postgres', 'production', '--host=example.test', names.postgres + '/x']) assert.throws(() => fixtureTarget({ TLL_SUBMISSION_TEST_CONTAINER: container }))
  for (const port of ['80', '65536', '04000', '4000/path', '4e3', '4000\n']) assert.throws(() => fixtureTarget({ TLL_SUBMISSION_HTTP_PORT: port }))
  assert.throws(() => namesFor('invalid'))
})
test('Docker socket must remain local and unambiguous', () => {
  assert.equal(localEndpoint('unix:///var/run/docker.sock'), 'unix:///var/run/docker.sock')
  for (const endpoint of ['ssh://remote', 'tcp://127.0.0.1:2375', 'tcp://remote:2376', 'unix://relative', 'unix:///a\n--host=remote']) assert.throws(() => localEndpoint(endpoint))
})
test('dump fingerprint excludes random psql restriction tokens only', () => {
  assert.equal(dumpFingerprint('\\restrict abc\nTABLE DATA\n\\unrestrict abc\n', 'ROLES'), dumpFingerprint('\\restrict xyz\nTABLE DATA\n\\unrestrict xyz', 'ROLES'))
  assert.notEqual(dumpFingerprint('DATA1', 'ROLES'), dumpFingerprint('DATA2', 'ROLES'))
  assert.notEqual(dumpFingerprint('DATA', 'ROLES1'), dumpFingerprint('DATA', 'ROLES2'))
})
function replayExecutor(mode) {
  let dumpCount = 0
  return (_binary, args) => {
    if (args.includes('pg_dump')) return mode === 'changed' && dumpCount++ ? 'changed-data' : 'data'
    if (args.includes('pg_dumpall')) return 'roles'
    if (mode === 'success') return ''
    const error = new Error('synthetic error')
    error.stderr = mode === 'wrong' ? 'something else failed' : 'Gateway already exists or schema name collides; inspect migration history'
    throw error
  }
}
test('migration replay requires the explicit guard and unchanged whole database/role dumps', () => {
  assert.doesNotThrow(() => verifyReplay(replayExecutor('guard'), {}))
  assert.throws(() => verifyReplay(replayExecutor('changed'), {}), /changed database/)
  assert.throws(() => verifyReplay(replayExecutor('success'), {}), /unexpectedly replayed/)
  assert.throws(() => verifyReplay(replayExecutor('wrong'), {}), /required collision guard/)
})
function harness({ failHttp = false, wrongLabel = false, unavailable = false, remote = false, abortAtHttp = false } = {}) {
  const calls = [], logs = [], relays = []
  let clock = 0
  const controller = new AbortController()
  const execute = async (binary, args, options = {}) => {
    calls.push({ binary, args, options })
    if (args[0] === 'context') return remote ? 'ssh://remote' : 'unix:///var/run/docker.sock'
    if (args.includes('pg_isready')) {
      if (unavailable) throw new Error('not yet ready')
      return '127.0.0.1:5432 - accepting connections'
    }
    if (args.includes('inspect')) {
      return wrongLabel ? 'belongs-to-somebody-else' : id
    }
    if (args.includes('tests/submissions/http.test.mjs')) {
      if (abortAtHttp) { controller.abort(); throw new Error('interrupted') }
      if (failHttp) throw new Error('synthetic HTTP test failure')
    }
    return 'synthetic success'
  }
  return {
    calls, logs, relays,
    run: () => runAcceptance({ execute, relayFactory: async options => { relays.push(options); return { address: { address: '127.0.0.1', port: 45678 }, close: async () => { calls.push({ args: ['relay-close'], options: {} }) } } }, request: async () => ({ status: 200, json: async () => ({ paths: { '/rpc/submit_public_form': {} } }) }), pause: async ms => { clock += ms }, now: () => clock, signal: controller.signal, env: {}, platform: 'linux', id, log: value => logs.push(value) }),
  }
}
test('runner orders migration, replay and HTTP checks and cleans only its own labelled resources', async () => {
  const fixture = harness(); await fixture.run()
  const commands = fixture.calls.map(call => call.args.join(' '))
  const databaseIndex = commands.findIndex(value => value.includes('--test tests/submissions/database.test.mjs'))
  const replayIndex = commands.findIndex(value => value.includes('tests/submissions/verify-replay.mjs'))
  const httpIndex = commands.findIndex(value => value.includes('--test tests/submissions/http.test.mjs'))
  assert.ok(databaseIndex < replayIndex && replayIndex < httpIndex)
  assert.ok(commands.some(value => value.includes('network create --internal')))
  const pgCommand = commands.find(value => value.includes(`run --detach --rm --name ${names.postgres}`))
  assert.ok(pgCommand); assert.equal(pgCommand.includes('--publish'), false)
  assert.equal(commands.some(value => value.includes('--publish')), false)
  assert.equal(fixture.relays.length, 1)
  assert.equal(fixture.relays[0].runId, id)
  assert.equal(fixture.relays[0].endpoint, 'unix:///var/run/docker.sock')
  assert.ok(commands.indexOf('relay-close') < commands.findIndex(value => value.includes('container rm')))
  assert.equal(commands.filter(value => value.includes('container rm --force --volumes')).length, 2)
  assert.equal(commands.filter(value => value.includes(`network rm ${names.network}`)).length, 1)
  assert.equal(commands.some(value => /prune|--network host|service_role/.test(value)), false)
  const http = fixture.calls[httpIndex]
  assert.equal(http.options.env.TLL_SUBMISSION_TEST_CONTAINER, names.postgres)
  assert.equal(http.options.env.TLL_SUBMISSION_HTTP_PORT, '45678')
  assert.equal(http.options.env.DOCKER_HOST, 'unix:///var/run/docker.sock')
  assert.ok(fixture.logs.some(value => value.startsWith('PASS:')))
})
for (const mode of ['failHttp', 'abortAtHttp']) test(`failed or interrupted HTTP suite still cleans all owned resources: ${mode}`, async () => {
  const fixture = harness({ [mode]: true })
  await assert.rejects(fixture.run())
  const cleanup = fixture.calls.filter(call => call.args.includes('rm'))
  assert.equal(cleanup.length, 3)
  assert.equal(fixture.calls.filter(call => call.args.includes('relay-close')).length, 1)
  assert.ok(cleanup.every(call => call.options.signal === undefined))
  assert.equal(fixture.logs.some(value => value.startsWith('PASS:')), false)
})
test('readiness is bounded, propagates failure and cleans only resources already attempted', async () => {
  const fixture = harness({ unavailable: true })
  await assert.rejects(fixture.run(), /within 60 seconds/)
  assert.equal(fixture.calls.filter(call => call.args.includes('pg_isready')).length, 60)
  assert.equal(fixture.calls.filter(call => call.args.includes('rm')).length, 2)
  assert.equal(fixture.calls.some(call => call.args.includes('tests/submissions/database.test.mjs')), false)
})
test('cleanup refuses resources with wrong ownership labels', async () => {
  const fixture = harness({ wrongLabel: true })
  await assert.rejects(fixture.run(), /could not be removed/)
  assert.equal(fixture.calls.some(call => call.args.includes('rm')), false)
  assert.equal(fixture.logs.some(value => value.startsWith('PASS:')), false)
})
test('remote Docker contexts fail before pulls, service contact or mutations', async () => {
  const fixture = harness({ remote: true })
  await assert.rejects(fixture.run(), /remote contexts/)
  assert.equal(fixture.calls.length, 1)
})
