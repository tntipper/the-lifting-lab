// Guard every Next worker in the preview build/runtime acceptance test.
// Node --require preloads must be CommonJS before Next worker imports run.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require('node:fs')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const net = require('node:net')
const allowed = new Set(['127.0.0.1', 'localhost', '::1'])
function check(host) {
  if (!host || allowed.has(host)) return
  if (process.env.TLL_TEST_NETWORK_LOG) fs.appendFileSync(process.env.TLL_TEST_NETWORK_LOG, `${host}\n`)
  throw new Error(`External network blocked by preview test: ${host}`)
}
const originalConnect = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...args) {
  const values = Array.isArray(args[0]) ? args[0] : args
  const options = values[0]
  if (options && typeof options === 'object') check(options.host || options.hostname)
  else if (typeof values[1] === 'string') check(values[1])
  return originalConnect.apply(this, args)
}
const originalFetch = globalThis.fetch
globalThis.fetch = (input, init) => {
  check(new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname)
  return originalFetch(input, init)
}
