import test from 'node:test'
import assert from 'node:assert/strict'
import { localFixtureConfig, fixtureEnvironment, assertOwnedFixture, ownedFixtureAction, FIXTURE_OWNER_LABEL } from './fixtures/local-pg-fixture.mjs'
const namespace = '55bd02e6-785a-42bd-a67e-7448387f910c'
const env = { TLL_TEST_FIXTURE_NAMESPACE: namespace, TLL_TEST_PG_PORT: '0', TLL_TEST_REST_PORT: '0' }
test('legacy defaults remain fixed, while isolated namespace propagates only validated fixture fields', () => {
  assert.equal(localFixtureConfig({}).postgres, 'tll-stage0-postgres')
  assert.deepEqual(fixtureEnvironment({ ...env, SECRET: 'not propagated' }), env)
  assert.equal(localFixtureConfig(env).postgres, `tll-test-${namespace}-postgres`)
})
test('invalid namespaces, ambiguous ports and overrides without namespace are refused', () => {
  for (const namespace of ['', 'tll-stage0', '../../other', '--force', 'UPPERCASE', undefined])
    assert.throws(() => localFixtureConfig({ ...env, TLL_TEST_FIXTURE_NAMESPACE: namespace }))
  for (const port of ['', '-1', '80', '65536', '01', '55432;rm', undefined])
    assert.throws(() => localFixtureConfig({ ...env, TLL_TEST_PG_PORT: port }))
  assert.throws(() => localFixtureConfig({ ...env, TLL_TEST_PG_PORT: '55432', TLL_TEST_REST_PORT: '55432' }))
})
test('cleanup cannot target another namespace, missing owner, historical default or failed inspection', () => {
  const config = localFixtureConfig(env), calls = []
  const inspect = label => args => { calls.push(args); return JSON.stringify({ [FIXTURE_OWNER_LABEL]: label }) }
  for (const label of [undefined, 'other-owner']) {
    calls.length = 0; assert.throws(() => ownedFixtureAction(config, 'remove', inspect(label)))
    assert.equal(calls.length, 1); assert.equal(calls[0][0], 'inspect')
  }
  assert.throws(() => ownedFixtureAction({ ...config, postgres: 'tll-stage0-postgres' }, 'remove', inspect(namespace)))
  assert.throws(() => ownedFixtureAction(localFixtureConfig({}), 'remove', inspect(namespace)))
  assert.throws(() => assertOwnedFixture(config, () => { throw Error('inspection denied') }))
  calls.length = 0
  ownedFixtureAction(config, 'remove', args => { calls.push(args); return args[0] === 'inspect' ? JSON.stringify({ [FIXTURE_OWNER_LABEL]: namespace }) : '' })
  assert.deepEqual(calls[1], ['rm', '-fv', config.postgres])
  assert.throws(() => ownedFixtureAction(config, 'restart', inspect(namespace)))
})
