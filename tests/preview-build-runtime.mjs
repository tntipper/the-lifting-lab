// Run serially: this uses this checkout's .next directory. No live service calls.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const root = fileURLToPath(new URL('../', import.meta.url))
const fixture = name => fileURLToPath(new URL(`fixtures/${name}`, import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), 'tll-preview-acceptance-'))
const log = join(temporary, 'network.log')
await writeFile(log, '')
const productionOrigin = 'https://wrhgscovsgsudtedbljr.supabase.co'
const baseEnv = {
  ...process.env, NEXT_TELEMETRY_DISABLED: '1',
  NEXT_FONT_GOOGLE_MOCKED_RESPONSES: fixture('preview-fonts.cjs'),
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require ${JSON.stringify(fixture('no-external-network.cjs'))}`.trim(),
  TLL_TEST_NETWORK_LOG: log,
  NEXT_PUBLIC_SUPABASE_URL: productionOrigin,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-test-key-never-a-real-credential',
  NEXT_PUBLIC_TLL_ENVIRONMENT: 'production', TLL_STAGING_SUPABASE_PROJECT_REF: '',
}
function next(args, env) {
  const child = spawn(process.execPath, ['node_modules/next/dist/bin/next', ...args], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', value => { output += value.toString() })
  child.stderr.on('data', value => { output += value.toString() })
  return { child, output: () => output }
}
let server
try {
  console.log('Building inherited-production Preview with all external connections blocked...')
  const build = next(['build'], { ...baseEnv, VERCEL_ENV: 'preview' })
  const buildTimeout = setTimeout(() => build.child.kill('SIGTERM'), 180000)
  const [code] = await once(build.child, 'exit'); clearTimeout(buildTimeout)
  assert.equal(code, 0, build.output().slice(-8000))
  async function compiled(dir) {
    let result = ''
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name)
      if (entry.isDirectory()) result += await compiled(path)
      else if (entry.name.endsWith('.js')) result += await readFile(path, 'utf8')
    }
    return result
  }
  for (const target of ['.next/server', '.next/static/chunks']) {
    const code = await compiled(join(root, target))
    assert.ok(code.includes('synthetic_preview_unavailable'), `${target} must retain the inert transport response`)
    assert.ok(code.includes('https://tll-preview.invalid'), `${target} must inline the reserved origin`)
    assert.ok(!code.includes(productionOrigin), `${target} must not contain the inherited production DB URL`)
  }
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening')
  const port = reservation.address().port
  await new Promise(resolve => reservation.close(resolve))
  // Deliberately change runtime env: built public values must stay isolated.
  server = next(['start', '--hostname', '127.0.0.1', '--port', String(port)], { ...baseEnv, VERCEL_ENV: 'production' })
  const deadline = Date.now() + 30000
  while (!server.output().includes('Ready in')) {
    assert.equal(server.child.exitCode, null, server.output())
    assert.ok(Date.now() < deadline, server.output())
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const origin = `http://127.0.0.1:${port}`
  for (const path of ['/', '/products', '/auth', '/contact', '/submit', '/dashboard', '/account/settings']) {
    const response = await fetch(`${origin}${path}`)
    assert.equal(response.status, 200, path)
    assert.equal(response.headers.get('x-tll-preview'), 'synthetic', path)
    const html = await response.text()
    assert.ok(html.includes('synthetic-preview-notice'), path)
    assert.ok(!html.includes('googletagmanager.com/gtag/js'), path)
    assert.ok(!/<form\b/.test(html), path)
    if (!['/', '/products'].includes(path)) assert.ok(html.includes('No email will be sent'), path)
  }
  for (const [path, method] of [['/api/products', 'GET'], ['/api/cart', 'GET'], ['/api/cart', 'PATCH'], ['/api/contact', 'POST'], ['/api/profile', 'DELETE'], ['/auth/signout', 'POST']]) {
    const response = await fetch(`${origin}${path}`, { method })
    assert.equal(response.status, 503, path)
    assert.equal((await response.json()).code, 'synthetic_preview_unavailable')
  }
  const robots = await fetch(`${origin}/robots.txt`).then(response => response.text())
  assert.match(robots, /Disallow: \/\s/)
  assert.equal(await readFile(log, 'utf8'), '', 'Build/runtime must attempt no external requests')
  console.log('PASS: real Next build and runtime remain visibly inert after conflicting runtime env; zero external connections.')
} finally {
  if (server?.child.exitCode === null) { server.child.kill('SIGTERM'); await once(server.child, 'exit') }
  await rm(temporary, { recursive: true, force: true })
}
