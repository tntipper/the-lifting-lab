import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import test from 'node:test'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const React = require('react')
const { renderToStaticMarkup: render } = require('react-dom/server')
const root = fileURLToPath(new URL('../', import.meta.url))
const categories = ['cycle-support', 'liver-health', 'hormone-support', 'zma']
const originalFetch = globalThis.fetch
globalThis.fetch = () => { throw new Error('Outbound network is forbidden in claims tests') }
test.after(() => { globalThis.fetch = originalFetch })
const product = { id: 'fixture-product', name: 'Fixture formula', brand: 'Fixture', category: 'cycle-support', score: 95, nutrients: [], retail_price: null, informed_sport: false }

// Execute real TSX/data modules with synthetic catalogue rows. No credentials,
// Supabase SDK, browser sessions or outbound requests are loaded.
function fixture({ category = 'cycle-support', modalOpen = false, nutrients = [] } = {}) {
  const cache = new Map()
  const lookups = []
  const item = { ...product, category, nutrients }
  const blank = () => null
  const rows = Array.from({ length: 8 }, (_, i) => ({ ...item, id: `fixture-${i}` }))
  const sb = { from(table) {
    lookups.push(table)
    const result = { data: table === 'reviews' ? [] : rows, error: null }
    return { select() { return this }, eq() { return this }, then(resolve) { return Promise.resolve(result).then(resolve) } }
  } }
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename)
    const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
      reportDiagnostics: true,
    })
    assert.deepEqual(compiled.diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error), [], relative)
    const loadedModule = { exports: {} }
    const localRequire = name => {
      if (name === 'react' && modalOpen) return { ...React, useState: () => [true, () => {}] }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === 'next/navigation') return { notFound() { throw new Error('not found') }, useRouter: () => ({ back() {} }), useSearchParams: () => new URLSearchParams() }
      if (name === 'next/og') return { ImageResponse: class { constructor(element) { this.element = element } } }
      if (name === '@/lib/og-card') return { renderOgCard: config => config, OG_SIZE: {}, OG_CONTENT_TYPE: 'image/png' }
      if (name === '@/lib/supabase') return { createClient: () => { throw new Error('Client auth is outside this render test') } }
      if (name === '@/lib/supabase-public') return { createPublicClient: () => sb }
      if (name === '@/lib/share-products-server') return { getShareProducts: async () => ({ ok: true, products: [item] }) }
      if (name === '@/lib/product-data') return { fetchProductDetail: async () => item, fetchCategory: async () => [] }
      if (name === '@/lib/products') return { PRODUCT_COLUMNS: '*', withScore: p => p, sortScored: a => a, trueCostReason: () => null }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ inStack: () => false, toggle() {} }) }
      if (name === '@/components/ScoreBadge') return { __esModule: true, default: ({ score }) => React.createElement('span', {}, `Score ${score}`), scoreColor: () => '#fff' }
      if ((name.startsWith('@/components/') && !['@/components/ClaimsReviewNotice', '@/components/MethodologyModal', '@/components/AccessibleDialog', '@/components/ProductAssessment'].includes(name)) || name === './RelatedProducts') return { __esModule: true, default: blank }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
        const resolved = ['.ts', '.tsx'].map(ext => base + ext).find(existsSync)
        assert.ok(resolved, `Unexpected dependency: ${name}`)
        return load(path.relative(root, resolved))
      }
      return require(name)
    }
    vm.runInThisContext(`(function(require,module,exports){${compiled.outputText}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports)
    cache.set(filename, loadedModule.exports)
    return loadedModule.exports
  }
  return { load, lookups, item }
}

function schemas(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]))
}
const escape = text => render(React.createElement('span', {}, text)).replace(/^<span>|<\/span>$/g, '')
function assertFaqMatches(html) {
  const body = html.replace(/<script.*?<\/script>/gs, '')
  const faq = schemas(html).find(data => data['@type'] === 'FAQPage')
  assert.ok(faq)
  for (const entry of faq.mainEntity) {
    assert.ok(body.includes(escape(entry.name)), entry.name)
    assert.ok(body.includes(escape(entry.acceptedAnswer.text)), entry.acceptedAnswer.text)
  }
}

test('testosterone visible page, FAQ, metadata and social image all communicate the review without a purchase recommendation', () => {
  const f = fixture()
  const page = f.load('app/testosterone/page.tsx')
  const html = render(React.createElement(page.default))
  assert.match(html, /Evidence Review in Progress/)
  assert.match(html, /Clinical assessment comes first/)
  assert.match(html, /rare liver injury/)
  assert.match(html, /endocrine.org\/clinical-practice-guidelines\/testosterone-therapy/)
  assertFaqMatches(html)
  assert.equal(page.metadata.description, page.metadata.openGraph.description)
  assert.equal(page.metadata.description, page.metadata.twitter.description)
  assert.ok(html.includes(page.metadata.description))
  assert.doesNotMatch(html, /What Actually Works|Real Evidence|Buy the few things|Browse hormone support|Build my stack/)
  const card = f.load('app/testosterone/opengraph-image.tsx').default()
  assert.match(card.title, /Under Review/)
  assert.equal(card.subtitle, page.metadata.description)
})

test('affected guides have aligned FAQ and metadata, official citations, and no ranked picks or clinical-review claim', async () => {
  for (const category of ['cycle-support', 'hormone-support', 'zma']) {
    const f = fixture({ category })
    const page = f.load('app/guide/[category]/page.tsx')
    const params = Promise.resolve({ category })
    const html = render(await page.default({ params }))
    const metadata = await page.generateMetadata({ params })
    assert.match(html, /under review/i)
    assertFaqMatches(html)
    assert.equal(metadata.description, metadata.openGraph.description)
    assert.equal(metadata.description, metadata.twitter.description)
    const article = schemas(html).find(data => data['@type'] === 'WebPage')
    assert.equal(article.description, metadata.description)
    assert.equal(article.lastReviewed, undefined)
    assert.ok(article.citation.every(c => c['@type'] === 'WebPage'))
    assert.equal(schemas(html).some(s => s['@type'] === 'ItemList'), false)
    assert.doesNotMatch(html, /Top .*?picks|Full .*?ranking|are what protect you|are what protect your health/)
    assert.deepEqual(f.lookups, [], 'A paused recommendation must not query ranked catalogue rows')
    const card = await f.load('app/guide/[category]/opengraph-image.tsx').default({ params })
    assert.match(render(card.element), /under review/i)
  }
})

test('ordinary guide retains research while withholding all unapproved product picks and ranked schema', async () => {
  const f = fixture({ category: 'creatine' })
  const page = f.load('app/guide/[category]/page.tsx')
  const html = render(await page.default({ params: Promise.resolve({ category: 'creatine' }) }))
  assert.equal(schemas(html).some(data => data['@type'] === 'ItemList'), false)
  assert.match(html, /No approved product effectiveness/); assert.doesNotMatch(html, /Fixture formula/)
  assert.deepEqual(f.lookups, ['products'])
})

test('affected product pages hide historical numbers and retain review notice without editorial rating schema', async () => {
  for (const category of categories) {
    const f = fixture({ category })
    const page = f.load('app/products/[id]/page.tsx')
    const params = Promise.resolve({ id: product.id })
    const html = render(await page.default({ params }))
    const metadata = await page.generateMetadata({ params })
    assert.match(html, /under review/i)
    assert.doesNotMatch(html, /95\/100/)
    assert.match(metadata.description, /under review/i)
    assert.doesNotMatch(metadata.description, /EFSA|Dose-for-dose/)
    assert.doesNotMatch(html, /Excellent Effectiveness Match|Strong Effectiveness Match|Green = meets dose/)
    const productSchema = schemas(html).find(s => s['@type'] === 'Product')
    assert.equal(productSchema.review, undefined)
    assert.equal(productSchema.name, 'Fixture Fixture formula')
    const card = await f.load('app/products/[id]/opengraph-image.tsx').default({ params })
    const cardHtml = render(card.element)
    assert.match(cardHtml, /Claims Under Review/)
    assert.match(cardHtml, /95/)
    assert.doesNotMatch(cardHtml, /EFSA|Evidence-Based Scoring/)
  }
})

test('ordinary positive historical value does not publish an approved editorial rating', async () => {
  const f = fixture({ category: 'creatine' })
  const page = f.load('app/products/[id]/page.tsx')
  const html = render(await page.default({ params: Promise.resolve({ id: product.id }) }))
  const productSchema = schemas(html).find(s => s['@type'] === 'Product')
  assert.equal(productSchema.review, undefined)
  assert.doesNotMatch(html, /Excellent Effectiveness Match|95\/100/); assert.match(html, /Not assessed/)
})

test('open methodology modal presents legacy weights and sources, without perfect-dose promises for review categories', () => {
  const f = fixture({ modalOpen: true })
  const Modal = f.load('components/MethodologyModal.tsx').default
  for (const category of categories) {
    const html = render(React.createElement(Modal, { category }))
    assert.match(html, /Legacy weights under review/)
    assert.match(html, /https:\/\//)
    assert.doesNotMatch(html, /The perfect|key liver protection agent|strongest human evidence|meets effective dose|How the winner is chosen/)
  }
  assert.match(render(React.createElement(Modal, { category: 'creatine' })), /Historical formula inputs — unverified/)
})

test('crawlable methodology includes the same interim notices and FAQ limitations', () => {
  const f = fixture()
  const Page = f.load('app/methodology/page.tsx').default
  const html = render(React.createElement(Page))
  assert.match(html, /Organ-protection claims under review/)
  assert.match(html, /Hormone claims under review/)
  assert.match(html, /Legacy weights under review/)
  assert.doesNotMatch(html, /key liver protection agent|strongest evidence for organ|strongest human evidence/)
  assertFaqMatches(html)
})


test('catalogue cards show review status in the all-products view without effective-dose promises', () => {
  for (const category of categories) {
    const f = fixture({ category })
    const Grid = f.load('app/products/ProductGrid.tsx').default
    const html = render(React.createElement(Grid, { initialProducts: [f.item] }))
    assert.match(html, /under review/i)
    assert.doesNotMatch(html, /95\/100/)
    assert.doesNotMatch(html, /Excellent dosing|Good dosing|🥇|Liver &amp; organ protection|Hormonal balance|Testosterone &amp; growth hormone/)
  }
})

test('product review containment preserves existing explicit safety warnings', () => {
  const f = fixture({ category: 'hormone-support', nutrients: [{ nutrient_name: 'caffeine', amount: 500, unit: 'mg' }] })
  const Page = f.load('app/products/[id]/ProductDetailPage.tsx').default
  const html = render(React.createElement(Page, { product: f.item, related: [] }))
  assert.match(html, /above 400mg, potential side effects/)
  assert.match(html, /Hormone claims under review/)
})
