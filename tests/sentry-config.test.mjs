import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
const out = await build({ entryPoints: ['lib/sentry-config.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { sentryOptions } = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString('base64')}`)
test('Sentry is off by default and needs both the flag and a DSN', () => {
  assert.equal(sentryOptions(undefined, 'https://k@o.ingest.sentry.io/1', 'production'), null)
  assert.equal(sentryOptions('true', 'https://k@o.ingest.sentry.io/1', 'production'), null)
  assert.equal(sentryOptions('1', '', 'production'), null)
  const o = sentryOptions('1', 'https://k@o.ingest.sentry.io/1', 'preview')
  assert.equal(o.sendDefaultPii, false); assert.equal(o.environment, 'preview')
})
