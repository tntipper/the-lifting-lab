import { execFileSync } from 'node:child_process'
export const FIXTURE_OWNER_LABEL = 'tll.test-fixture-owner'
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
const denied = () => { throw Error('Local fixture configuration refused') }
export function localFixtureConfig(env = process.env) {
  const namespace = env.TLL_TEST_FIXTURE_NAMESPACE
  if (namespace === undefined) {
    if (env.TLL_TEST_PG_PORT !== undefined || env.TLL_TEST_REST_PORT !== undefined) denied()
    return Object.freeze({ namespace: null, postgres: 'tll-stage0-postgres', postgrest: 'tll-stage0-postgrest', pgPort: 55432, restPort: 55433 })
  }
  if (typeof namespace !== 'string' || !uuid.test(namespace)) denied()
  const port = value => {
    if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{3,4})$/.test(value)) denied()
    const number = Number(value)
    if (number !== 0 && (number < 1024 || number > 65535)) denied()
    return number
  }
  const pgPort = port(env.TLL_TEST_PG_PORT), restPort = port(env.TLL_TEST_REST_PORT)
  if (pgPort !== 0 && pgPort === restPort) denied()
  return Object.freeze({ namespace, postgres: `tll-test-${namespace}-postgres`, postgrest: `tll-test-${namespace}-postgrest`, pgPort, restPort })
}
const docker = args => {
  if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) denied()
  const options = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 10_000 }
  if (!execFileSync('docker', ['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}'], options).trim().startsWith('unix://')) denied()
  return execFileSync('docker', args, options).trim()
}
export function fixtureEnvironment(env = process.env) {
  const config = localFixtureConfig(env)
  return config.namespace === null ? {} : { TLL_TEST_FIXTURE_NAMESPACE: config.namespace,
    TLL_TEST_PG_PORT: String(config.pgPort), TLL_TEST_REST_PORT: String(config.restPort) }
}
export function assertOwnedFixture(config, invoke = docker) {
  if (config.namespace === null) return
  const expected = localFixtureConfig({ TLL_TEST_FIXTURE_NAMESPACE: config.namespace,
    TLL_TEST_PG_PORT: String(config.pgPort), TLL_TEST_REST_PORT: String(config.restPort) })
  if (config.postgres !== expected.postgres || config.postgrest !== expected.postgrest) denied()
  const value = JSON.parse(invoke(['inspect', '--format', '{{json .Config.Labels}}', expected.postgres]))
  if (value?.[FIXTURE_OWNER_LABEL] !== expected.namespace) denied()
}
export function ownedFixtureAction(config, action, invoke = docker) {
  if (!config.namespace || !['start', 'stop', 'remove'].includes(action)) denied()
  assertOwnedFixture(config, invoke)
  return invoke(action === 'remove' ? ['rm', '-fv', config.postgres] : [action, config.postgres])
}
