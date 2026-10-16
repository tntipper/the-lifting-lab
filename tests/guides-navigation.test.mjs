import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)

test('legacy guide redirects are 301 and keep existing product/dashboard redirects', async () => {
  const bundle = await build({ entryPoints: ['next.config.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
  const { default: config } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`)
  const redirects = await config.redirects()
  const { getRedirectStatus } = require('next/dist/lib/redirect-status')
  for (const [source, destination] of [['/guides', '/guide'], ['/guides/:slug', '/guide/:slug']]) {
    const redirect = redirects.find(row => row.source === source)
    assert.equal(redirect.destination, destination)
    assert.equal(getRedirectStatus(redirect), 301)
  }
  assert.ok(redirects.some(row => row.source.startsWith('/products/')))
  assert.ok(redirects.some(row => row.source === '/dashboard' && row.destination === '/account' && row.permanent === false))
})

test('home has a guides entry without adding a differently sized method tile', () => {
  const home = readFileSync('app/page.tsx', 'utf8')
  assert.match(home, /href="\/guide"/)
  assert.equal((home.match(/<article/g) ?? []).length, 1)
})

test('desktop, mobile menu and compact research header render a Guides link', async () => {
  const React = require('react'), { renderToStaticMarkup } = require('react-dom/server')
  const ts = require('typescript'), vm = await import('node:vm')
  for (const pathname of ['/products', '/sources']) {
    let state = 0
    const mod = { exports: {} }
    const overrides = {
      react: { ...React, useEffect() {}, useId: () => 'menu', useRef: () => ({ current: null }), useState: initial => [state++ === 0 ? true : initial, () => {}] },
      'next/link': { __esModule: true, default: props => React.createElement('a', props) },
      'next/navigation': { usePathname: () => pathname, useSearchParams: () => new URLSearchParams() },
      '@/lib/supabase': { createClient: () => { throw new Error('SSR cannot use auth') } },
      '@/lib/preview-mode': { isSyntheticPreview: () => false },
      '@/lib/identity/staging-customer-ui': { accountSignInHref: () => '/account' },
      './LocalStackContext': { useLocalStack: () => ({ stack: [] }) },
      './StagingCartContext': { useStagingCart: () => null },
      './ShopPanelsContext': { useShopPanels: () => ({ basket: [] }) },
    }
    const js = ts.transpileModule(readFileSync('components/TopNav.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    vm.runInNewContext(js, { module: mod, exports: mod.exports, URL, URLSearchParams, require: name => overrides[name] ?? require(name) })
    const html = renderToStaticMarkup(React.createElement(mod.exports.default, { signedInInitial: false }))
    if (pathname === '/products') {
      assert.match(html, /aria-label="Shop categories"[\s\S]*?href="\/guide"/)
      assert.match(html, /aria-label="Mobile navigation"[\s\S]*?href="\/guide"/)
    } else assert.match(html, /aria-label="Main"[\s\S]*?href="\/guide"/)
  }
})
