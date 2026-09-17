// Only the known synthetic fixture or this runner's generated names are accepted.
// No database URL or external HTTP host is configurable.
export const DATABASE = 'tll_stack_test'
export function fixtureTarget(env = process.env) {
  const container = env.TLL_STACK_TEST_CONTAINER ?? 'tll-stage0-postgres'
  if (container !== 'tll-stage0-postgres' && !/^tll-stack-ci-postgres-[a-f0-9]{12}$/.test(container)) throw new Error('Invalid synthetic stack container')
  const port = env.TLL_STACK_HTTP_PORT ?? '55435'
  if (!/^[1-9][0-9]{3,4}$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error('Invalid loopback stack HTTP port')
  return Object.freeze({ container, database: DATABASE, origin: `http://127.0.0.1:${port}` })
}
