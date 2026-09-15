import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import React from 'react'
import { renderToStaticMarkup as render } from 'react-dom/server'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const base = { id: 'research', brand: 'Fixture', name: 'Research formula', category: 'creatine', score: null,
  cost_per_serving: 1, retail_price: 20, servings_per_container: 20, serving_size: 5, serving_unit: 'g',
  informed_sport: false, image_url: null, buy_url: 'https://shop.theliftinglab.co.uk/products/fixture?variant=123',
  proprietary_blend: false, amino_spiked: false, protein_yield: null,
  nutrients: [{ nutrient_name: 'creatine', amount: 5000, unit: 'mg' }],
}
const make = (overrides = {}) => ({ ...base, ...overrides })

// Execute real shared selectors and public TSX with in-memory rows. Only
// framework/provider boundaries are adapted; no credentials or network calls.
function fixture(rows = [make()]) {
  const cache = new Map()
  const sb = { from(table) {
    let data = table === 'reviews' ? [] : rows
    return { select() { return this }, eq(field, value) { if (field === 'category') data = data.filter(p => p.category === value); return this },
      then(done) { return Promise.resolve({ data, error: null }).then(done) } }
  } }
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename)
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const mod = { exports: {} }
    const localRequire = name => {
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === 'next/navigation') return { notFound() { throw new Error('not found') }, useRouter: () => ({ back() {} }), useSearchParams: () => new URLSearchParams() }
      if (name === 'next/og') return { ImageResponse: class { constructor(element) { this.element = element } } }
      if (name === '@/lib/supabase-public') return { createPublicClient: () => sb }
      if (name === '@/lib/supabase') return { createClient() { throw new Error('No auth in SSR fixture') } }
      if (name === '@/lib/product-data') return { fetchProductDetail: async () => rows[0], fetchCategory: async () => rows.slice(1) }
      if (name === '@/lib/share-products-server') return { getShareProducts: async () => ({ ok: true, products: [rows[0]] }) }
      if (name === '@/lib/scores') return { scoreFor: (brand, productName) => rows.find(p => p.brand === brand && p.name === productName)?.score ?? null }
      if (name === '@/lib/gtag') return { track() { throw new Error('No tracking in SSR fixture') } }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ inStack: () => false, toggle() {} }) }
      if (['@/components/TopNav', '@/components/FavouriteButton', '@/components/ReviewSection', '@/components/ShareModal'].includes(name)) return { __esModule: true, default: () => null }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const basePath = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
        const resolved = ['.ts', '.tsx'].map(ext => basePath + ext).find(existsSync)
        assert.ok(resolved, `Unexpected dependency: ${name}`)
        return load(path.relative(root, resolved))
      }
      return require(name)
    }
    vm.runInNewContext(js, { require: localRequire, module: mod, exports: mod.exports, process: { env: {} }, URL, URLSearchParams,
      fetch() { throw new Error('Outbound requests forbidden') } }, { filename })
    cache.set(filename, mod.exports)
    return mod.exports
  }
  return { load, html: (file, props) => render(React.createElement(load(file).default, props)) }
}
const invalid = [null, undefined, 0, -1, 101, NaN, Infinity, -Infinity]
const holds = ['cycle-support', 'liver-health', 'hormone-support', 'zma']
for (const score of invalid) test(`unknown score ${String(score)} has no public endorsement`, () => {
  const p = make({ score }), f = fixture([p])
  const policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.assessmentDisplayFor(p).state, 'unassessed')
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
    ['components/FavouriteCard.tsx', { product: p }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Not assessed/, file)
    assert.match(html, /Research formula/, file)
    assert.doesNotMatch(html, /🥇|🥈|🥉|Top Pick|Best rated|wins on|Excellent dosing|Good dosing|Below effective dose|full 5g effective|Green = meets dose|ATP resynthesis/, file)
    assert.match(html, /Shop offer under review/, 'Assessment changes must not release own-shop holds')
  }
})
for (const category of holds) test(`${category} retains historical values without awards or dose flags`, async () => {
  const p = make({ category, score: 99 }), f = fixture([p])
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
    ['components/FavouriteCard.tsx', { product: p }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Under review/); assert.match(html, /99\/100/)
    assert.doesNotMatch(html, /🥇|Top Pick|Best rated|wins on|full 5g effective|Green = meets dose/)
  }
  const best = render(await f.load('app/best/page.tsx').default())
  assert.doesNotMatch(best, /Research formula|🏆|🥇/)
  assert.match(best, /No ranking is available/)
})
test('positive legacy display survives with an explicit label; no new scientific approval', () => {
  const p = make({ score: 80 }), f = fixture([p])
  const html = f.html('app/products/ProductGrid.tsx', { initialProducts: [p] })
  assert.match(html, /80%/); assert.match(html, /Legacy score/); assert.match(html, /Top Pick/); assert.match(html, /🥇/)
  assert.equal(f.load('lib/assessment-display.ts').assessmentDisplayFor(p).state, 'legacy')
  assert.doesNotMatch(html, /scientifically approved|verified assessment/i)
})
test('ranking sorts keep research records without giving them placement; name and brand never award', () => {
  const unknown = make({ id: 'unknown', name: 'A unknown', score: 0, cost_per_serving: .001 })
  const held = make({ id: 'held', name: 'B held', category: 'zma', score: 100, cost_per_serving: .001 })
  const legacy = make({ id: 'legacy', name: 'Z legacy', score: 80 })
  const rows = [unknown, held, legacy], f = fixture(rows)
  const { sortScored } = f.load('lib/products.ts'), { isRankingCandidate } = f.load('lib/assessment-display.ts')
  for (const sort of ['score', 'value', 'budget']) {
    const sorted = sortScored(rows, sort)
    assert.equal(sorted[0].id, 'legacy'); assert.equal(sorted.length, 3)
    assert.deepEqual(Array.from(sorted, p => isRankingCandidate(p, sort)), [true, false, false])
  }
  for (const sort of ['name', 'brand', 'price']) assert.ok(rows.every(p => !isRankingCandidate(p, sort)))
  assert.equal(sortScored(rows, 'name')[0].id, 'unknown')
  assert.equal(rows[0].id, 'unknown', 'Input must remain untouched')
})
for (const cost of [null, 0, -1, NaN, Infinity]) test(`invalid cost ${String(cost)} cannot become a value/budget winner`, () => {
  const p = make({ score: 90, cost_per_serving: cost }), f = fixture([p])
  const policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.isRankingCandidate(p, 'score'), true)
  assert.equal(policy.isRankingCandidate(p, 'budget'), false)
  assert.equal(policy.isRankingCandidate(p, 'value'), false)
  const awards = f.load('lib/best-categories.ts').deriveAwards([p])
  assert.equal(awards.bestValue, null); assert.equal(awards.bestBudget, null)
})
test('actual award, guide, alternatives, matchup, stack and brand selectors share the gate', async () => {
  const rows = [make({ id: 'zero', score: 0, name: 'A zero' }), make({ id: 'held', score: 100, category: 'zma', name: 'B held' }),
    ...Array.from({ length: 5 }, (_, i) => make({ id: `legacy-${i}`, name: `Legacy ${i}`, score: 80 - i }))]
  const f = fixture(rows), best = f.load('lib/best-categories.ts')
  assert.deepEqual(Array.from(await best.rankedProducts('creatine'), p => p.id), rows.slice(2).map(p => p.id))
  assert.deepEqual(Array.from(await best.rankedCategorySlugs()), ['creatine'])
  assert.equal(best.deriveAwards(rows).bestOverall.id, 'legacy-0')
  const awards = render(await f.load('app/best/page.tsx').default())
  assert.match(awards, /Legacy 0/); assert.doesNotMatch(awards, /A zero|B held/)
  const guide = render(await f.load('app/guide/[category]/page.tsx').default({ params: Promise.resolve({ category: 'creatine' }) }))
  assert.match(guide, /Legacy 0/); assert.doesNotMatch(guide, /A zero|B held/)
  const alts = f.load('lib/alternatives.ts')
  assert.ok(alts.alternativesFor(rows[2], rows).every(p => p.id.startsWith('legacy-')))
  assert.equal(alts.valueRatio(rows[1]), null)
  assert.ok(f.load('lib/matchups.ts').curatedMatchups(rows).every(m => m.a.id.startsWith('legacy-') && m.b.id.startsWith('legacy-')))
  const stacks = f.load('lib/stacks.ts')
  for (const pick of ['score', 'budget']) {
    const selected = stacks.selectStack(new Map([['creatine', rows.filter(p => p.category === 'creatine')], ['zma', [rows[1]]]]), { categories: ['zma', 'creatine'], maxProducts: 3, pick })
    assert.deepEqual(Array.from(selected, p => p.id), ['legacy-0'])
  }
  const stats = f.load('lib/brand-matchups.ts').buildBrandStats(rows)
  assert.equal(stats[0].bestScore, 80); assert.equal(stats[0].products.length, 5)
})
test('related research cards do not claim an unassessed product is an upgrade or top pick', () => {
  const p = make(), f = fixture([p])
  const html = f.html('app/products/[id]/RelatedProducts.tsx', { items: [p], productId: 'target', category: 'creatine', score: 0, brand: 'Fixture', name: 'Target' })
  assert.match(html, /Other Creatine records/); assert.match(html, /Not assessed/)
  assert.doesNotMatch(html, /Rated Higher|Top Creatine|strong .*picks|\+\d/)
})
test('unknown product metadata and social card do not publish an editorial assessment', async () => {
  const f = fixture([make({ score: 0 })]), params = Promise.resolve({ id: 'research' })
  const page = f.load('app/products/[id]/page.tsx'), html = render(await page.default({ params }))
  const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]))
  assert.equal(schemas.find(s => s['@type'] === 'Product').review, undefined)
  assert.match((await page.generateMetadata({ params })).description, /not assessed/i)
  const social = render((await f.load('app/products/[id]/opengraph-image.tsx').default({ params })).element)
  assert.match(social, /Not assessed/); assert.doesNotMatch(social, /EFSA|Evidence-Based Scoring/)
})

test('public API sends null ranks and explicit status for research records; OpenAPI agrees', async () => {
  const rows = [make({ id: 'zero', name: 'A zero', score: 0 }), make({ id: 'unknown', name: 'B unknown' }),
    make({ id: 'legacy', name: 'Z legacy', score: 80 })]
  const f = fixture(rows), api = f.load('app/api/ard/compare/route.ts')
  const response = await api.GET(new Request('https://fixture.invalid/api/ard/compare?category=creatine&sort=score'))
  assert.equal(response.status, 200)
  const json = await response.json()
  assert.deepEqual(json.results.map(p => [p.id, p.rank, p.assessment_state]), [['legacy', 1, 'legacy'], ['zero', null, 'unassessed'], ['unknown', null, 'unassessed']])
  assert.ok(json.results.every(p => p.buy_url === null && p.retailer_url === null))
  const held = fixture([make({ category: 'zma', score: 99 })])
  const heldJson = await (await held.load('app/api/ard/compare/route.ts').GET(new Request('https://fixture.invalid/api/ard/compare?category=zma&sort=score'))).json()
  assert.equal(heldJson.results[0].rank, null); assert.equal(heldJson.results[0].score, 99)
  assert.equal(heldJson.results[0].assessment_state, 'under_review')
  const spec = await (await f.load('app/api/ard/openapi.json/route.ts').GET()).json()
  assert.deepEqual(spec.components.schemas.RankedProduct.properties.rank.type, ['integer', 'null'])
})
test('value and cheapest consumers exclude held or unknown assessments even at a lower price', async () => {
  const rows = [make({ id: 'held', category: 'zma', score: 100, name: 'Held bargain', retail_price: 1 }),
    make({ id: 'unknown', score: 0, name: 'Unknown bargain', retail_price: 1 }), make({ id: 'legacy', score: 80, name: 'Legacy eligible' })]
  const f = fixture(rows)
  assert.deepEqual(Array.from(f.load('lib/cheapest.ts').rankCheapest(rows), p => p.id), ['legacy'])
  const html = render(await f.load('app/value/page.tsx').default())
  assert.match(html, /Legacy eligible/); assert.doesNotMatch(html, /Held bargain|Unknown bargain/)
})
test('an unknown score cannot become a watch-out verdict or an ingredient recommendation', async () => {
  const rows = [make({ id: 'unknown', score: 0, name: 'Unknown formula' })]
  const f = fixture(rows)
  assert.equal((await f.load('lib/watch-outs.ts').categoryWatchOuts()).length, 0)
  const html = render(await f.load('app/ingredients/[slug]/page.tsx').default({ params: Promise.resolve({ slug: 'creatine-monohydrate' }) }))
  assert.doesNotMatch(html, /Unknown formula/)
})
