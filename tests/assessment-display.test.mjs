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
function fixture(rows = [make()], env = {}, loadedStack = false, showTotals = false, gridParams = null, assessmentDisplay = null, reviewedRecords = null, tooltipHooks = null) {
  const cache = new Map()
  const sb = { from(table) {
    let data = table === 'reviews' ? [] : rows
    return { select() { return this }, eq(field, value) { if (field === 'category') data = data.filter(p => p.category === value); return this },
      in() { return this }, order() { return this }, single() { return Promise.resolve({ data: data[0], error: null }) }, maybeSingle() { return this.single() },
      then(done) { return Promise.resolve({ data, error: null }).then(done) } }
  } }
  function load(relative) {
    const filename = path.resolve(root, relative)
    if (cache.has(filename)) return cache.get(filename)
    const js = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText
    const mod = { exports: {} }
    let stackHook = 0
    let gridHook = 0
    const localRequire = name => {
      if (name === '../data/reviewed-assessments.json') return reviewedRecords ?? JSON.parse(readFileSync(new URL('../data/reviewed-assessments.json', import.meta.url), 'utf8'))
      if (name === '@/lib/assessment-display' && assessmentDisplay) return { assessmentDisplayFor: assessmentDisplay }
      if (name.endsWith('.module.css')) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) }
      if (name === 'react' && tooltipHooks && relative === 'components/ShopScoreBadge.tsx') return { ...React, ...tooltipHooks }
      if (name === 'react' && gridParams && relative === 'app/products/ProductGrid.tsx') return { ...React,
        useState(initial) {
          const index = gridHook++
          return React.useState(index === 2 ? gridParams.category ?? 'all' : index === 5 ? gridParams.group ?? null : initial)
        } }
      if (name === 'react' && loadedStack && relative === 'app/stack/StackBuilder.tsx') return { ...React,
        useState(initial) {
          const index = stackHook++
          return React.useState(index === 0 ? rows.map(p => ({ id: p.id, servings_per_day: 1, products: { ...p, product_nutrients: p.nutrients } })) : index === 4 ? false : index === 7 ? showTotals : initial)
        } }

      if (name === 'next/server') return { ...require('next/server'), connection: async () => {} }
      if (name === './store-mapping-server') return {
        ...load('lib/commerce/store-mapping-server.ts'),
        createStoreMappingReader: () => async () => rows.flatMap(p => {
          const m = p.storeLinkMapping
          if (!m) return []
          const identity = { formulaId: 'synthetic', formulaVersion: 'v1', flavourId: 'vanilla', labelVersion: 'v1',
            pack: { version: 'v1', sellingUnit: 'single', innerCount: 1, amountPerInner: 500, unit: 'g' } }
          return [{ comparison_product_id: p.id, status: 'store', active: m.active,
            shopify_product_id: 'gid://shopify/Product/2', shopify_variant_id: m.shopifyVariantId,
            handle: m.shopifyProductHandle, supplier: 'synthetic', supplier_sku: 'synthetic',
            pack: null, flavour: null, approval_reference: 'synthetic-review', review: m.review,
            mapping_status: 'exact', mapping_source: 'verified_labels', shop_identity: identity, supplier_identity: identity }]
        }),
      }
      if (name === 'next/link') return { __esModule: true, default: ({ children, ...props }) => React.createElement('a', props, children) }
      if (name === 'next/navigation') return { notFound() { throw new Error('not found') }, useRouter: () => ({ back() {} }), useSearchParams: () => new URLSearchParams() }
      if (name === 'next/og') return { ImageResponse: class { constructor(element) { this.element = element } } }
      if (name === '@/lib/supabase-public') return { createPublicClient: () => sb }
      if (name === '@/lib/supabase') return { createClient() { throw new Error('No auth in SSR fixture') } }
      if (name === '@/lib/product-data') return { fetchProductDetail: async () => rows[0], fetchCategory: async () => rows.slice(1),
        fetchCatalogue: (...args) => load('lib/product-data.ts').fetchCatalogue(...args),
        fetchCompareProducts: (...args) => load('lib/product-data.ts').fetchCompareProducts(...args),
        parseCompareIds: (...args) => load('lib/product-data.ts').parseCompareIds(...args) }
      if (name === '@/lib/share-products-server') return { getShareProducts: async () => ({ ok: true, products: [rows[0]] }) }
      if (name === '@/lib/scores') return { scoreFor: (brand, productName) => rows.find(p => p.brand === brand && p.name === productName)?.score ?? null }
      if (name === '@/lib/gtag') return { track() { throw new Error('No tracking in SSR fixture') } }
      if (name === '@/components/LocalStackContext') return { useLocalStack: () => ({ inStack: () => false, toggle() {}, stack: rows.map(p => ({ id: p.id })), state: { loading: false }, add() {}, remove() {}, retry() {} }) }
      if (['@/components/TopNav', '@/components/FavouriteButton', '@/components/ReviewSection', '@/components/ShareModal'].includes(name)) return { __esModule: true, default: () => null }
      if (name.startsWith('@/') || name.startsWith('.')) {
        const basePath = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name)
        const resolved = ['.ts', '.tsx'].map(ext => basePath + ext).find(existsSync)
        assert.ok(resolved, `Unexpected dependency: ${name}`)
        return load(path.relative(root, resolved))
      }
      return require(name)
    }
    vm.runInNewContext(js, { require: localRequire, module: mod, exports: mod.exports, process: { env }, URL, URLSearchParams, structuredClone,
      fetch() { throw new Error('Outbound requests forbidden') } }, { filename })
    cache.set(filename, mod.exports)
    return mod.exports
  }
  return { load, html: (file, props) => render(React.createElement(load(file).default, props)) }
}
const invalid = [null, undefined, 0, -1, 101, NaN, Infinity, -Infinity]
const holds = ['cycle-support', 'liver-health', 'hormone-support', 'zma']

test('shop hero opens the catalogue with ascending pack-price sorting', () => {
  const f = fixture()
  const html = f.html('components/ShopHero.tsx', { products: [make()] })
  assert.match(html, /href="\/products\?sort=price"[^>]*>Shop by price<\/a>/)
  assert.doesNotMatch(html, /Shop by score/)
  const { sortScored } = f.load('lib/products.ts')
  assert.deepEqual(Array.from(sortScored([make({ id: 'large', retail_price: 40 }), make({ id: 'small', retail_price: 10 })], 'price'), p => p.id), ['small', 'large'])
})

for (const [label, overrides, expected] of [
  ['listed pack', { retail_price: 19.5 }, '£19.50'],
  ['Shopify takes precedence', { retail_price: 99, storePrice: { price: 12.5 } }, '£12.50'],
  ['missing Shopify never falls back', { retail_price: 99, storePrice: { price: null } }, null],
  ...[null, 0, -1, NaN, Infinity].map(retail_price => [`unlisted ${retail_price}`, { retail_price }, null]),
]) test(`catalogue and home cards show pack prices: ${label}`, () => {
  const p = make(overrides), f = fixture([p])
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['components/TopProductsTable.tsx', { products: [p] }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, file.includes('ProductGrid') ? />Price</ : p.storePrice ? /TLL Store price/ : /Listed price/)
    if (expected) assert.ok(html.includes(expected), file)
    else assert.match(html, /(?:Price|Listed price|TLL Store price)<\/(?:span|div)><(?:b|div)[^>]*>(?:Price not listed|Not listed)<\/(?:b|div)>/)
    assert.doesNotMatch(html, /£99\.00|£NaN|£Infinity|£0\.00|£-1\.00/)
  }
})

for (const score of invalid) test(`unknown score ${String(score)} has no public endorsement`, () => {
  const p = make({ score }), f = fixture([p])
  const policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.assessmentDisplayFor(p).state, 'under_review')
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
    ['components/FavouriteCard.tsx', { product: p }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Under review/, file)
    assert.match(html, /Research formula/, file)
    assert.doesNotMatch(html, /🥇|🥈|🥉|Top Pick|Best rated|wins on|Excellent dosing|Good dosing|Below effective dose|full 5g effective|Green = meets dose|ATP resynthesis/, file)
    assert.match(html, /Shop offer under review/, 'Assessment changes must not release own-shop holds')
  }
})
for (const category of holds) test(`${category} withholds historical values without awards or dose flags`, async () => {
  const p = make({ category, score: 99 }), f = fixture([p])
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
    ['components/FavouriteCard.tsx', { product: p }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Under review/); assert.doesNotMatch(html, /99\/100/)
    assert.doesNotMatch(html, /🥇|Top Pick|Best rated|wins on|full 5g effective|Green = meets dose/)
  }
  const best = render(await f.load('app/best/page.tsx').default())
  assert.doesNotMatch(best, /Research formula|🏆|🥇/)
  assert.match(best, /No approved effectiveness/)
})
test('positive legacy value stays in research data but not the public catalogue card', () => {
  const p = make({ score: 80 }), f = fixture([p])
  const html = f.html('app/products/ProductGrid.tsx', { initialProducts: [p] })
  assert.match(html, /Under review/); assert.doesNotMatch(html, /80\/100|80%|Legacy score|Top Pick|🥇|Excellent dosing|Good dosing|ATP resynthesis/)
  assert.equal(f.load('lib/assessment-display.ts').assessmentDisplayFor(p).state, 'under_review')
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
    assert.equal(sorted[0].id, 'unknown'); assert.equal(sorted.length, 3)
    assert.deepEqual(Array.from(sorted, p => isRankingCandidate(p, sort)), [false, false, false])
  }
  for (const sort of ['name', 'brand', 'price']) assert.ok(rows.every(p => !isRankingCandidate(p, sort)))
  assert.equal(sortScored(rows, 'name')[0].id, 'unknown')
  assert.equal(rows[0].id, 'unknown', 'Input must remain untouched')
})
for (const cost of [null, 0, -1, NaN, Infinity]) test(`invalid cost ${String(cost)} cannot become a value/budget winner`, () => {
  const p = make({ score: 90, cost_per_serving: cost }), f = fixture([p])
  const policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.isRankingCandidate(p, 'score'), false)
  assert.equal(policy.isRankingCandidate(p, 'budget'), false)
  assert.equal(policy.isRankingCandidate(p, 'value'), false)
  const awards = f.load('lib/best-categories.ts').deriveAwards([p])
  assert.equal(awards.bestValue, null); assert.equal(awards.bestBudget, null)
})
test('actual award, guide, alternatives, matchup, stack and brand selectors share the gate', async () => {
  const rows = [make({ id: 'zero', score: 0, name: 'A zero' }), make({ id: 'held', score: 100, category: 'zma', name: 'B held' }),
    ...Array.from({ length: 5 }, (_, i) => make({ id: `legacy-${i}`, name: `Legacy ${i}`, score: 80 - i }))]
  const f = fixture(rows), best = f.load('lib/best-categories.ts')
  assert.deepEqual(Array.from(await best.rankedProducts('creatine'), p => p.id), [])
  assert.deepEqual(Array.from(await best.researchCategorySlugs()), Array.from(f.load('lib/categories.ts').CATEGORIES, c => c.slug))
  assert.equal(best.deriveAwards(rows).bestOverall, null)
  const awards = render(await f.load('app/best/page.tsx').default())
  assert.match(awards, /No approved effectiveness/); assert.doesNotMatch(awards, /Legacy 0|A zero|B held/)
  const guide = render(await f.load('app/guide/[category]/page.tsx').default({ params: Promise.resolve({ category: 'creatine' }) }))
  assert.match(guide, /No approved product effectiveness/); assert.doesNotMatch(guide, /Legacy 0|A zero|B held/)
  const alts = f.load('lib/alternatives.ts')
  assert.ok(alts.alternativesFor(rows[2], rows).some(p => p.id === 'zero')); assert.equal(alts.valueRatio(rows[2]), null)
  assert.equal(alts.valueRatio(rows[1]), null)
  assert.ok(f.load('lib/matchups.ts').curatedMatchups(rows).some(m => m.a.id === 'zero' || m.b.id === 'zero'))
  const stacks = f.load('lib/stacks.ts')
  for (const pick of ['score', 'budget']) {
    const selected = stacks.selectStack(new Map([['creatine', rows.filter(p => p.category === 'creatine')], ['zma', [rows[1]]]]), { categories: ['zma', 'creatine'], maxProducts: 3, pick })
    assert.deepEqual(Array.from(selected, p => p.id), [])
  }
  const stats = f.load('lib/brand-matchups.ts').buildBrandStats(rows)
  assert.equal(stats[0].bestScore, null); assert.equal(stats[0].avgScore, null); assert.equal(stats[0].products.length, rows.length)
})
test('related research cards do not claim an unassessed product is an upgrade or top pick', () => {
  const p = make(), f = fixture([p])
  const html = f.html('app/products/[id]/RelatedProducts.tsx', { items: [p], productId: 'target', category: 'creatine', score: 0, brand: 'Fixture', name: 'Target' })
  assert.match(html, /Other Creatine records/); assert.match(html, /Under review/)
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
  assert.deepEqual(json.results.map(p => [p.id, p.rank, p.assessment_state]), [['zero', null, 'under_review'], ['unknown', null, 'under_review'], ['legacy', null, 'under_review']])
  assert.ok(json.results.every(p => p.buy_url === null && p.retailer_url === null))
  const held = fixture([make({ category: 'zma', score: 99 })])
  const heldJson = await (await held.load('app/api/ard/compare/route.ts').GET(new Request('https://fixture.invalid/api/ard/compare?category=zma&sort=score'))).json()
  assert.equal(heldJson.results[0].rank, null); assert.equal(heldJson.results[0].score, null)
  assert.equal(heldJson.results[0].assessment_state, 'under_review')
  const spec = await (await f.load('app/api/ard/openapi.json/route.ts').GET()).json()
  assert.deepEqual(spec.components.schemas.RankedProduct.properties.rank.type, ['integer', 'null']); assert.ok(json.results.every(p => p.recommendation_status === 'unavailable'))
})
test('effectiveness value is unavailable; price-only comparison retains known prices irrespective of historical score', async () => {
  const rows = [make({ id: 'held', category: 'zma', score: 100, name: 'Held bargain', retail_price: 1 }),
    make({ id: 'unknown', score: 0, name: 'Unknown bargain', retail_price: 1 }), make({ id: 'legacy', score: 80, name: 'Legacy eligible' })]
  const f = fixture(rows)
  assert.deepEqual(Array.from(f.load('lib/cheapest.ts').rankCheapest(rows), p => p.id), ['held', 'unknown', 'legacy'])
  const html = render(await f.load('app/value/page.tsx').default())
  assert.match(html, /Effectiveness value assessment unavailable/); assert.doesNotMatch(html, /Legacy eligible|Held bargain|Unknown bargain/)
})
test('an unknown score cannot become a watch-out verdict or an ingredient recommendation', async () => {
  const rows = [make({ id: 'unknown', score: 0, name: 'Unknown formula' })]
  const f = fixture(rows)
  assert.equal((await f.load('lib/watch-outs.ts').categoryWatchOuts()).length, 0)
  const html = render(await f.load('app/ingredients/[slug]/page.tsx').default({ params: Promise.resolve({ slug: 'creatine-monohydrate' }) }))
  assert.doesNotMatch(html, /Unknown formula/)
})

test('approval cannot be forged from positive history, category, score bounds or caller fields', () => {
  const f = fixture(), policy = f.load('lib/assessment-display.ts')
  for (const category of [...holds, 'creatine', 'whey', 'pre-workout', 'unknown']) {
    for (const score of [...invalid, .01, 50, 70, 100]) {
      const candidate = make({ category, score, approved: true, assessment_status: 'approved', assessment_version: 'fixture-approved', recommendation_status: 'approved' })
      assert.equal(policy.hasApprovedAssessment(candidate), false)
      for (const sort of ['score', 'value', 'budget']) assert.equal(policy.isRankingCandidate(candidate, sort), false)
    }
  }
})

test('positive history stays neutral across actual public components and preserves manual research actions', () => {
  const p = make({ score: 95 }), f = fixture([p])
  for (const [file, props] of [
    ['components/ProductAssessment.tsx', { product: p }],
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
    ['components/FavouriteCard.tsx', { product: p }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Not assessed|Under review/); assert.doesNotMatch(html, /95\/100|95 out of 100|>95</)
    assert.doesNotMatch(html, /🥇|🥈|🥉|🏆|Top Pick|Best rated|wins on|Excellent dosing|Good dosing|full 5g effective|Green = meets dose|ATP resynthesis|Only available legacy scores/)
    const assessment = html.match(/<[^>]*data-assessment="under_review"[^>]*>/)?.[0]
    assert.ok(assessment, file); assert.match(assessment, /text-lab-muted/)
    if (['app/products/ProductGrid.tsx', 'app/products/[id]/ProductDetailPage.tsx'].includes(file)) {
      assert.match(html, /aria-label="Under review"/)
      assert.match(html, /<circle/)
      assert.doesNotMatch(html, /stroke-dasharray=/)
    }
  }
  const detail = f.html('app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] })
  assert.match(detail, /5000/); assert.match(detail, /My Stack|\+ Stack|Add to Stack/i)
})

test('known best, alternative, product-vs and brand-vs URLs preserve research without editorial awards', async () => {
  const rows = [make({ id: 'first', brand: 'Alpha', name: 'Positive record', score: 95 }), make({ id: 'second', brand: 'Beta', name: 'Unknown record', score: 0 })]
  const f = fixture(rows), matchups = f.load('lib/matchups.ts')
  const cases = [
    ['app/best/[category]/page.tsx', { category: 'creatine' }],
    ['app/alternatives/[product]/page.tsx', { product: matchups.productSlug('Alpha', 'Positive record') }],
    ['app/vs/[matchup]/page.tsx', { matchup: matchups.matchupSlug(rows[0].brand, rows[0].name, rows[1].brand, rows[1].name) }],
    ['app/brands-vs/[matchup]/page.tsx', { matchup: 'alpha-vs-beta' }],
    ['app/brand/[slug]/page.tsx', { slug: 'alpha' }],
  ]
  for (const [file, paramsValue] of cases) {
    const page = f.load(file), params = Promise.resolve(paramsValue)
    const html = render(await page.default({ params }))
    assert.match(html, /Positive record/, `${file} must preserve known research`)
    assert.doesNotMatch(html, /🥇|🥈|🥉|🏆|Top Pick|Best rated|top-rated alternative|wins on Effectiveness|scoring 95\/100/)
    const meta = await page.generateMetadata({ params })
    assert.doesNotMatch(JSON.stringify(meta), /clinical reference|Better-Rated|Which Is Better|ranked by effectiveness/i)
    assert.match(JSON.stringify(meta), /unavailable|unverified/i)
  }
})

test('positive product metadata and social images never certify a frozen formula', async () => {
  const f = fixture([make({ score: 95 })]), params = Promise.resolve({ id: 'research' })
  const page = f.load('app/products/[id]/page.tsx'), html = render(await page.default({ params }))
  const schema = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1])).find(s => s['@type'] === 'Product')
  assert.equal(schema.review, undefined); assert.equal(schema.aggregateRating, undefined)
  assert.doesNotMatch(JSON.stringify(await page.generateMetadata({ params })), /Dose-for-dose|EFSA|scores 95/i)
  const image = render((await f.load('app/products/[id]/opengraph-image.tsx').default({ params })).element)
  assert.match(image, /Not assessed/); assert.doesNotMatch(image, /95|Unverified Historical|#a6e22e[^>]*>95/)
  for (const file of ['app/opengraph-image.tsx', 'app/best/opengraph-image.tsx', 'app/value/opengraph-image.tsx', 'app/watch-outs/opengraph-image.tsx']) {
    const social = render((await f.load(file).default()).element)
    assert.doesNotMatch(social, /ranked 0–100|top-scoring|still actually works|effective doses — not marketing|lowest-scoring/)
  }
})

test('price arithmetic accepts held and positive legacy records but rejects unknown units and nonfinite inputs', () => {
  const p = make({ score: 95, category: 'whey', serving_size: 30, protein_yield: 80, retail_price: 20, servings_per_container: 20 })
  const f = fixture([p]), { withScore } = f.load('lib/products.ts'), { proteinValueRows } = f.load('lib/protein-value.ts')
  assert.equal(withScore(p).cost_per_serving, 1)
  const calculated = proteinValueRows([p])[0]
  assert.equal(calculated.totalProtein, 480); assert.equal(calculated.costPerGram, 20 / 480)
  for (const field of ['retail_price', 'servings_per_container']) for (const value of [null, 0, -1, NaN, Infinity, '20']) {
    assert.equal(withScore({ ...p, [field]: value }).cost_per_serving, null)
  }
  for (const field of ['retail_price', 'servings_per_container', 'serving_size', 'protein_yield']) for (const value of [null, 0, -1, NaN, Infinity, '20']) {
    assert.equal(proteinValueRows([{ ...p, [field]: value }]).length, 0)
  }
  for (const unit of [null, 'scoop', 'ml']) assert.equal(proteinValueRows([{ ...p, serving_unit: unit }]).length, 0)
  assert.equal(proteinValueRows([{ ...p, protein_yield: 101 }]).length, 0)
})

test('caffeine amount ties are alphabetical and never use positive historical quality scores', () => {
  const rows = [make({ id: 'high', name: 'Z high legacy', category: 'pre-workout', score: 100 }), make({ id: 'unknown', name: 'A unknown', category: 'pre-workout', score: 0 })]
  const f = fixture(rows)
  const amounts = rows.map(p => ({ product_id: p.id, nutrient_name: 'Caffeine', amount: 200, unit: 'mg' }))
  assert.deepEqual(Array.from(f.load('lib/pre-workout-actives.ts').preWorkoutRows(rows, amounts), p => p.id), ['unknown', 'high'])
})

test('product API retains its array contract and explicitly denies recommendation approval', async () => {
  const rows = [make({ score: 95 })], f = fixture(rows)
  const response = await f.load('app/api/products/route.ts').GET(new Request('https://fixture.invalid/api/products?sort=value'))
  assert.equal(response.status, 200)
  const products = await response.json()
  assert.equal(products[0].score, null); assert.equal(products[0].assessment_state, 'under_review')
  assert.equal(products[0].recommendation_status, 'unavailable'); assert.match(products[0].assessment_note, /Under review/i)
})

test('detail and comparison APIs withhold frozen scores while preserving product identity', async () => {
  const p = make({ score: 95 }), f = fixture([p])
  const detail = await f.load('app/api/products/[id]/route.ts').GET(new Request('https://fixture.invalid/api/products/research'),
    { params: Promise.resolve({ id: 'research' }) })
  assert.equal(detail.status, 200)
  assert.equal((await detail.json()).score, null)
  const compare = await f.load('app/api/products/compare/route.ts').GET(new Request('https://fixture.invalid/api/products/compare?ids=research'))
  assert.equal(compare.status, 200)
  const rows = await compare.json()
  assert.equal(rows[0].id, 'research'); assert.equal(rows[0].score, null)
})

test('listed price ordering retains subpenny precision instead of ranking rounded penny ties', async () => {
  const rows = [make({ id: 'expensive', retail_price: 20.40, servings_per_container: 100 }), make({ id: 'cheap', name: 'Cheaper', retail_price: 19.60, servings_per_container: 100 }), make({ id: 'subpenny', name: 'Subpenny', retail_price: 1, servings_per_container: 1000 })]
  const f = fixture(rows), lib = f.load('lib/products.ts')
  assert.deepEqual(Array.from(f.load('lib/cheapest.ts').rankCheapest(rows), p => p.id), ['subpenny', 'cheap', 'expensive'])
  assert.equal(lib.withScore(rows[2]).cost_per_serving, .001); assert.equal(lib.formatListedServingPrice(.001), '<£0.01')
  assert.equal(lib.trueCostReason(rows[2]), null)
  const html = render(await f.load('app/cheapest/page.tsx').default())
  assert.match(html, /&lt;£0.01/); assert.doesNotMatch(html, /£0.00/)
})
test('caffeine and co-ingredient comparisons convert only finite explicit mass units', () => {
  const p = make({ category: 'pre-workout' }), f = fixture([p]), { preWorkoutRows } = f.load('lib/pre-workout-actives.ts')
  const row = (amount, unit, other = []) => preWorkoutRows([p], [{ product_id: p.id, nutrient_name: 'Caffeine', amount, unit }, ...other])
  for (const [amount, unit, expected] of [[200, 'mg', 200], [.2, 'g', 200], [200, 'µg', .2], [200, 'μg', .2], [200, 'mcg', .2], [0, 'mg', 0]]) assert.equal(row(amount, unit)[0].caffeineMg, expected)
  for (const [amount, unit] of [[200, 'scoop'], [200, 'ml'], [200, ''], [-1, 'mg'], [Infinity, 'mg'], [NaN, 'g'], ['200', 'mg']]) assert.equal(row(amount, unit).length, 0)
  const nutrient = (nutrient_name, amount, unit) => ({ product_id: p.id, nutrient_name, amount, unit })
  const amounts = row(200, 'mg', [nutrient('Beta-Alanine', 200, 'scoop'), nutrient('L-Citrulline', 3000, 'mg')])[0]
  assert.equal(amounts.betaAlanineG, null); assert.equal(amounts.citrullineG, 3)
})

test('every goal research route with positive history preserves its article without selected products or recommendation schema', async () => {
  const rows = [make({ score: 95, name: 'Never endorse this legacy formula' })], f = fixture(rows)
  const page = f.load('app/stacks/[goal]/page.tsx')
  for (const goal of f.load('lib/stacks.ts').STACK_SLUGS) {
    const params = Promise.resolve({ goal }), html = render(await page.default({ params }))
    assert.doesNotMatch(html, /Never endorse this legacy formula|highest-scoring option|current top-scoring|cheapest effective option|fallback to the top-scoring/)
    assert.match(html, /No approved|no product assessment|no automatic product/i)
    const schemas = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]))
    assert.equal(schemas.some(s => s['@type'] === 'ItemList'), false)
    assert.match(JSON.stringify(await page.generateMetadata({ params })), /unavailable|No approved/)
    const image = render((await f.load('app/stacks/[goal]/opengraph-image.tsx').default({ params })).element)
    assert.match(image, /no approved product or combined-stack recommendation/)
    assert.doesNotMatch(image, /products ranked|best-value protein|Real UK products/)
  }
})

test('crawlable methodology and glossary cannot recreate quality bands or effective-serving promises', () => {
  const f = fixture()
  const methodology = f.html('app/methodology/page.tsx')
  assert.match(methodology, /Historical formula inputs/)
  assert.match(methodology, /No approved effectiveness assessment/)
  assert.doesNotMatch(methodology, /A formula you can rely on|highest score wins|formula closest to the ideal|Meets or beats the effective dose|most effectiveness for what you actually pay/)
  const glossary = JSON.stringify(f.load('lib/glossary.ts'))
  assert.doesNotMatch(glossary, /Green \(70\+\) means|does it actually work.*gets decided|full, effective servings|Every category on the site has an evidence-based reference range/)
  assert.match(glossary, /Effectiveness rankings are unavailable/)
})

// T06: real page rendering with synthetic approved projections; no live reads.
const mapped = () => make({ buy_url: null, storeLinkMapping: {
  productId: base.id, shopifyProductHandle: 'fixture-vanilla', shopifyVariantId: 'gid://shopify/ProductVariant/1001',
  active: true, approved: true, review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: 1, expiresAtMs: Date.now() + 60000 },
} })
for (const surface of ['grid', 'detail', 'compare', 'best', 'stack']) {
  for (const enabled of [true, false]) test(`T06 ${surface} respects store-link flag ${enabled ? 'ON' : 'OFF'}`, async () => {
    const p = mapped(), f = fixture([p], enabled ? { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' } : {}, true)
    let html
    if (surface === 'best') html = render(await f.load('app/best/[category]/page.tsx').default({ params: Promise.resolve({ category: 'creatine' }) }))
    else {
      const [file, props] = {
        grid: ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
        detail: ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
        compare: ['app/compare/CompareView.tsx', { products: [p] }],
        stack: ['app/stack/StackBuilder.tsx', {}],
      }[surface]
      html = f.html(file, props)
    }
    if (enabled) {
      assert.match(html, /Buy at TLL Store/)
      const campaign = surface === 'compare' ? 'compare' : surface === 'stack' ? 'stack' : 'product'
      assert.ok(html.includes(`href="https://shop.theliftinglab.co.uk/products/fixture-vanilla?variant=1001&amp;utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=${campaign}&amp;ref=theliftinglab"`))
    } else assert.doesNotMatch(html, /Buy at TLL Store|variant=1001/)
  })
}

test('T06 grid renders ten mapped products with exact variant destinations and preserves an unmapped affiliate offer', () => {
  const products = Array.from({ length: 10 }, (_, index) => {
    const id = `mapped-${index}`
    return make({ id, name: `Mapped fixture ${index}`, buy_url: null,
      storeLinkMapping: { ...mapped().storeLinkMapping, productId: id, shopifyProductHandle: `fixture-${index}`, shopifyVariantId: `${1001 + index}` } })
  })
  products.push(make({ id: 'no-offer', buy_url: null }))
  products.push(make({ id: 'unmapped', name: 'Affiliate fixture', buy_url: 'https://www.amazon.co.uk/dp/B000000001' }))
  const html = fixture(products, { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled' }).html('app/products/ProductGrid.tsx', { initialProducts: products })
  for (let index = 0; index < 10; index++) assert.ok(html.includes(`href="https://shop.theliftinglab.co.uk/products/fixture-${index}?variant=${1001 + index}&amp;utm_source=theliftinglab&amp;utm_medium=referral&amp;utm_campaign=product&amp;ref=theliftinglab"`))
  assert.equal((html.match(/>Buy at TLL Store<\/a>/g) || []).length, 10)
  assert.match(html, /disabled=""[^>]*>Coming soon<\/button>/)
  assert.match(html, /href="https:\/\/www.amazon.co.uk\/dp\/B000000001/)
})

test('stack renders vitamin C guidance and iron safe level in totals and caution flags', () => {
  const p = make({ nutrients: [
    { nutrient_name: 'Vitamin C', amount: 1000, unit: 'mg' },
    { nutrient_name: 'Iron', amount: 40, unit: 'mg' },
    { nutrient_name: 'Vitamin D3', amount: 100, unit: 'mcg' },
  ] })
  const html = fixture([p], {}, true, true).html('app/stack/StackBuilder.tsx', {})
  for (const label of ['UK EVM guidance', 'EFSA intake guidance']) {
    assert.ok(html.includes(`100% ${label}`), `daily totals: ${label}`)
    assert.ok(html.includes(`100% of ${label}`), `caution flag: ${label}`)
  }
  assert.match(html, /100% of EFSA UL/)
  assert.match(html, /neither an established UL/)
  assert.doesNotMatch(html, /GI disturbance above UL/)
})


for (const source of ['mapping', 'variants']) test(`links enabled / prices off: ${source} never displays retail pack or serving price`, () => {
  const mapping = mapped().storeLinkMapping
  const raw = make({ retail_price: 99, servings_per_container: 20, ...(source === 'mapping' ? { storeLinkMapping: mapping } : {
    storeVariants: [{ variantId: mapping.shopifyVariantId, handle: mapping.shopifyProductHandle,
      label: 'Fixture pack', flavour: null, packLabel: '500 g', mapping }],
  }) })
  const f = fixture([raw], { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'off' })
  const p = f.load('lib/products.ts').withScore(raw)
  assert.equal(p.cost_per_serving, null)
  const { displayPrice, isStoreOffer } = f.load('lib/commerce/display-price.ts')
  assert.equal(p.storePrice, undefined)
  assert.equal(isStoreOffer(p), true)
  assert.equal(displayPrice(p), null)
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['components/TopProductsTable.tsx', { products: [p] }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /(?:Price|TLL Store price)<\/(?:span|div)><(?:b|div)[^>]*>Not listed<\/(?:b|div)>/, file)
    assert.doesNotMatch(html, /£99\.00|£4\.95/, file)
  }
  for (const [file, props] of [
    ['components/CompareTable.tsx', { products: [p], onRemove() {} }],
    ['app/compare/CompareView.tsx', { products: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Not listed|TLL Store price unavailable/, file)
    assert.doesNotMatch(html, /£99\.00|£4\.95/, file)
  }
})

test('display price uses only finite positive numbers and preserves non-store retail prices', () => {
  const { displayPrice, isUsablePrice, isStoreOffer } = fixture().load('lib/commerce/display-price.ts')
  assert.equal(displayPrice(make({ retail_price: 19.5 })), 19.5)
  assert.equal(isStoreOffer(make({ storeVariants: [] })), false)
  assert.equal(displayPrice(make({ storePrice: { price: 12.5 } })), 12.5)
  for (const price of [undefined, null, 0, -1, NaN, Infinity, -Infinity, '12.50']) {
    assert.equal(isUsablePrice(price), false)
    assert.equal(displayPrice(make({ retail_price: price })), null)
    const p = make({ retail_price: 99, storePrice: { price } })
    assert.equal(isStoreOffer(p), true)
    assert.equal(displayPrice(p), null)
  }
  assert.equal(isUsablePrice(0.001), true)
})

test('pack-price sorting uses displayed prices and puts unusable or unlisted store prices last', () => {
  const rows = [make({ id: 'missing', retail_price: null }), make({ id: 'high', retail_price: 40 }),
    make({ id: 'low', retail_price: 10, storePrice: { price: 50 } }),
    make({ id: 'unlisted-store', name: 'Y unlisted store', retail_price: 1, storeLinkMapping: mapped().storeLinkMapping }),
    make({ id: 'invalid', name: 'Z invalid', retail_price: Infinity })]
  const { sortScored } = fixture(rows).load('lib/products.ts')
  assert.deepEqual(Array.from(sortScored(rows, 'price'), p => p.id), ['high', 'low', 'missing', 'unlisted-store', 'invalid'])
  assert.equal(rows[0].id, 'missing')
})


test('store price attachment precedes scoring and comparison tables use the store price for Lowest', async () => {
  const raw = { ...mapped(), retail_price: 99, servings_per_container: 20 }
  const f = fixture([raw], { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'enabled' })
  const { attachStorePrices } = f.load('lib/commerce/store-price-products.ts')
  const now = Date.now()
  const [priced] = await attachStorePrices([raw], { enabled: true, now,
    read: async () => new Map([['gid://shopify/ProductVariant/1001', {
      variantId: 'gid://shopify/ProductVariant/1001', price: 12.5, availableForSale: true, observedAtMs: now,
    }]]) })
  const { withScore } = f.load('lib/products.ts')
  assert.equal(priced.storePrice.price, 12.5)
  assert.equal(withScore(priced).cost_per_serving, 0.625)
  // Deliberately different historical prices detect fallback in both display and Lowest tags.
  const store = withScore({ ...priced, retail_price: 99 })
  const other = withScore(make({ id: 'other', retail_price: 20 }))
  for (const file of ['components/CompareTable.tsx', 'app/compare/CompareView.tsx']) {
    const html = f.html(file, { products: [store, other], onRemove() {} })
    const row = html.match(/<tr[^>]*><th[^>]*>(?:Recorded pack price|Pack price)<\/th>(.*?)<\/tr>/s)?.[1]
    assert.ok(row, file)
    assert.match(row, /£12\.50.*Lowest.*£20\.00/s, file)
    assert.doesNotMatch(row, /£99\.00/, file)
  }
})

test('links on / prices off: API sorting and versus page do not expose historical store prices', async () => {
  const store = { ...mapped(), retail_price: 99, servings_per_container: 20 }
  const other = make({ id: 'other', brand: 'Other', name: 'Other formula', retail_price: 100 })
  const f = fixture([store, other], { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'off' })
  const response = await f.load('app/api/products/route.ts').GET(new Request('https://fixture.invalid/api/products?sort=price'))
  const products = await response.json()
  assert.deepEqual(products.map(p => p.id), ['other', store.id])
  assert.equal(products[1].cost_per_serving, null)
  const { matchupSlug } = f.load('lib/matchups.ts')
  const html = render(await f.load('app/vs/[matchup]/page.tsx').default({ params: Promise.resolve({
    matchup: matchupSlug(store.brand, store.name, other.brand, other.name),
  }) }))
  assert.match(html, /£100\.00/)
  assert.doesNotMatch(html, /£99\.00|£4\.95/)
})

test('links on / prices off: detail size and multi-variant projections never restore retail prices', () => {
  const mapping = mapped().storeLinkMapping
  const variant = { variantId: mapping.shopifyVariantId, handle: mapping.shopifyProductHandle,
    label: 'Fixture pack', flavour: null, packLabel: '500 g', mapping }
  const raw = make({ retail_price: 99, servings_per_container: 20, storeLinkMapping: mapping, storeVariants: [variant] })
  const f = fixture([raw], { NEXT_PUBLIC_TLL_STORE_LINKS: 'enabled', NEXT_PUBLIC_TLL_STORE_PRICES: 'off' })
  const p = f.load('lib/products.ts').withScore(raw)
  const size = { slug: 'fixture', label: 'Fixture pack', serving_size: 5, serving_unit: 'g',
    servings_per_container: 20, retail_price: 99, buy_url: null, shopify_variant_id: mapping.shopifyVariantId,
    sort: 0, nutrients: null }
  const sized = f.load('lib/commerce/size-selection.ts').productForSize(p, size)
  assert.equal(sized.retail_price, null)
  assert.equal(sized.cost_per_serving, null)
  for (const product of [
    { ...p, sizeOptions: [size] },
    { ...p, storeVariants: [variant, { ...variant, variantId: 'gid://shopify/ProductVariant/1002',
      mapping: { ...mapping, shopifyVariantId: 'gid://shopify/ProductVariant/1002' } }] },
  ]) {
    const html = f.html('app/products/[id]/ProductDetailPage.tsx', { product, related: [] })
    assert.doesNotMatch(html, /£99\.00|£4\.95/)
  }
})


test('certification appears beside the brand on cards and detail, without a full-width badge', () => {
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', p => ({ initialProducts: [p] })],
    ['app/products/[id]/ProductDetailPage.tsx', p => ({ product: p, related: [] })],
    ['components/FavouriteCard.tsx', p => ({ product: p })],
    ['components/TopProductsTable.tsx', p => ({ products: [p] })],
  ]) {
    const p = make({ informed_sport: true })
    const html = fixture([p]).html(file, props(p))
    assert.match(html, /brandLine[^]*?Fixture<\/[^>]+><span[^]*?aria-label="Informed Sport certified"/)
    assert.doesNotMatch(html, /Source ↗/)
    assert.doesNotMatch(html, /IS Certified|<p[^>]*>Informed Sport certified<\/p>/)
    const uncertified = make({ informed_sport: false })
    assert.doesNotMatch(fixture([uncertified]).html(file, props(uncertified)), /aria-label="Informed Sport certified"/)
  }
})


test('catalogue only shows sub-categories for the selected group', () => {
  for (const params of [{}, { category: 'pre-workout' }, { category: 'creatine' }, { category: 'hydration' }, { category: 'protein-bar' }]) {
    const html = fixture([make()], {}, false, false, params).html('app/products/ProductGrid.tsx', { initialProducts: [make()] })
    assert.doesNotMatch(html, /sub-categories/)
  }
  for (const params of [{ group: 'protein' }, { category: 'whey-isolate' }, { group: 'protein', category: 'casein' }]) {
    const html = fixture([make()], {}, false, false, params).html('app/products/ProductGrid.tsx', { initialProducts: [make()] })
    assert.match(html, /Protein sub-categories/)
    for (const label of ['All Protein', 'Whey', 'Whey Isolate', 'Casein']) assert.ok(html.includes(label))
    assert.doesNotMatch(html, />Creatine<\/button>|>Pre-Workout<\/button>/)
  }
  const health = fixture([make()], {}, false, false, { group: 'wellbeing' }).html('app/products/ProductGrid.tsx', { initialProducts: [make()] })
  assert.match(health, /Wellbeing sub-categories/)
  assert.match(health, />Vitamin D<\/button>/)
  assert.doesNotMatch(health, />Whey<\/button>/)
})

test('cards cap combined label rows at three and link to the full product label', () => {
  const nutrients = ['Creatine', 'Caffeine', 'Protein', 'Fat', 'Salt'].map(nutrient_name => ({ nutrient_name, amount: 1, unit: 'g' }))
  const p = make({ nutrients }), f = fixture([p])
  const card = f.html('app/products/ProductGrid.tsx', { initialProducts: [p] })
  assert.match(card, /href="\/products\/research"[^>]*>\+2 more<\/a>/)
  assert.match(card, /<dt>Creatine<\/dt>/)
  assert.match(card, /<dt>Protein<\/dt>/)
  assert.doesNotMatch(card, /<dt>Fat<\/dt>|<dt>Salt<\/dt>/)
  const full = f.html('components/ServingLabel.tsx', { nutrients })
  assert.match(full, /<dt>Salt<\/dt>/)
  assert.doesNotMatch(full, /more<\/a>/)
})

test('pack Price is first in card and detail, with secondary serving figures', () => {
  const p = make(), f = fixture([p])
  for (const [file, props] of [['app/products/ProductGrid.tsx', { initialProducts: [p] }], ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }]]) {
    const html = f.html(file, props)
    assert.match(html, /class="priceBox"><div class="primaryPrice"><span>Price<\/span><b>£20.00<\/b><\/div><div><span>True cost<\/span>/)
    assert.doesNotMatch(html, />Listed price<\/span>/)
  }
})


test('legacy values stay withheld and never grant ranking approval', () => {
  const policy = fixture().load('lib/assessment-display.ts')
  for (const score of [0.5, 1, 50, 100]) {
    const p = make({ score })
    assert.equal(policy.assessmentDisplayFor(p).score, null)
    assert.equal(policy.assessmentDisplayFor(p).state, 'under_review')
    assert.equal(policy.hasApprovedAssessment(p), false)
    for (const sort of ['score', 'value', 'budget']) assert.equal(policy.isRankingCandidate(p, sort), false)
  }
  for (const score of invalid) assert.equal(policy.assessmentDisplayFor(make({ score })).score, null)
  for (const category of holds) assert.equal(policy.assessmentDisplayFor(make({ category, score: 95 })).score, null)
})

test('catalogue and detail images use fill with responsive sizes inside ratio containers', () => {
  const p = make({ image_url: 'https://retailer.example/pack.jpg' }), f = fixture([p])
  for (const [file, props] of [
    ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
    ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /data-nimg="fill"/)
    // next/image omits sizes/srcset for unoptimised arbitrary retailer URLs.
    // Verify the responsive hint at the call site and real fill markup above.
    assert.match(readFileSync(path.join(root, file), 'utf8'), /sizes="\(max-width:/)
    assert.match(html, /object-contain/)
  }
  const css = readFileSync(path.join(root, 'components/shop.module.css'), 'utf8')
  assert.match(css, /\.packshot \{[^}]*aspect-ratio:4\/3/)
  assert.match(css, /\.detailImage \{[^}]*aspect-ratio:1; max-height:432px/)
  assert.match(css, /grid-auto-rows: 1fr/)
})


test('home product rows display review rings but retain alphabetical fallback without approved rankings', () => {
  const rows = [make({ id: 'z', brand: 'Zulu', score: 100 }), make({ id: 'a', brand: 'Alpha', score: 1 })]
  const html = fixture(rows).html('components/TopProductsTable.tsx', { products: rows })
  assert.ok(html.indexOf('Alpha') < html.indexOf('Zulu'))
  assert.match(html, /Approved scores are currently unavailable/)
  assert.match(html, /Under review/); assert.doesNotMatch(html, /100 out of 100|>100</)
  assert.doesNotMatch(html, /Effectiveness match 100|>Strong</)
})

test('capped cards retain late caffeine and expose a named, 32px full-label link', () => {
 const nutrients = ['Creatine', 'Citrulline', 'Beta alanine', 'Caffeine', 'Salt'].map(nutrient_name => ({ nutrient_name, amount: 250, unit: 'mg' }))
 const p = make({ nutrients }), f = fixture([p])
 const html = f.html('app/products/ProductGrid.tsx', { initialProducts: [p] })
 assert.equal((html.match(/<dt>/g) || []).length, 3)
 assert.match(html, /<dt>Caffeine<\/dt>/)
 assert.match(html, /Above EFSA single-dose guidance/)
 assert.doesNotMatch(html, /<dt>Beta alanine<\/dt>/)
 assert.match(html, /min-h-8/)
 assert.match(html, /aria-label="View 2 more label rows for Fixture Research formula"/)
 const ring = f.html('components/ShopScoreBadge.tsx', { product: make({ score: 80 }) })
 assert.match(ring, /role="img"[^>]*aria-label="Under review"/)
})

test('product metadata withholds legacy scores', async () => {
 const f = fixture([make({ score: 80 })])
 const meta = await f.load('app/products/[id]/page.tsx').generateMetadata({ params: Promise.resolve({ id: 'research' }) })
 assert.doesNotMatch(meta.description, /80|legacy score/)
 assert.match(meta.description, /not assessed/i)
})


test('score ring keeps only an outline and review label for every unreviewed product', () => {
  for (const category of ['creatine', ...holds]) for (const score of [...invalid, 0.5, 1, 80, 100]) {
    const html = fixture().html('components/ShopScoreBadge.tsx', { product: make({ category, score }) })
    assert.match(html, /role="img"[^>]*aria-label="Under review"/)
    assert.equal((html.match(/<circle /g) || []).length, 1)
    assert.match(html, />Under review<\/span>/)
    assert.doesNotMatch(html, /stroke-dasharray|scoreNumber|out of 100|Legacy score|>\d+</)
  }
})

test('score ring displays only the reviewed score returned by assessment display', () => {
  const f = fixture([], {}, false, false, null, () => ({ state: 'reviewed', score: 72, label: 'Reviewed', explanation: 'Reviewed fixture assessment' }))
  const html = f.html('components/ShopScoreBadge.tsx', { product: make({ score: 99 }) })
  assert.match(html, /aria-label="TLL Label Score: 72 out of 100"/)
  assert.match(html, /scoreNumber[^>]*>72</)
  assert.match(html, /stroke-dasharray=/)
  assert.doesNotMatch(html, /99|Under review|Legacy score/)
})

const signedAssessment = (overrides = {}) => ({
  key: 'research', score: 73, science_reviewer: 'Assay', science_date: '2026-10-15',
  compliance_reviewer: 'Oath', compliance_date: '2026-10-16', notes: 'Synthetic test review', ...overrides,
})
const withReviews = records => fixture([make()], {}, false, false, null, null, records)

test('empty reviewed dataset exposes only an outline and Under review, with no approval', () => {
  const f = fixture(), p = make({ score: 99 }), policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.assessmentDisplayFor(p).state, 'under_review')
  assert.equal(policy.assessmentDisplayFor(p).score, null)
  assert.equal(policy.hasApprovedAssessment(p), false)
  const html = f.html('components/ShopScoreBadge.tsx', { product: p })
  assert.match(html, /Under review/)
  assert.equal((html.match(/<circle/g) ?? []).length, 1)
  assert.doesNotMatch(html, /scoreNumber|stroke-dasharray|>99</)
})

test('both sign-offs publish the record score and make it rankable independently of caller score', () => {
  const f = withReviews([signedAssessment()]), policy = f.load('lib/assessment-display.ts')
  for (const score of [null, 0, 99]) {
    const p = make({ score })
    assert.equal(policy.hasApprovedAssessment(p), true)
    assert.equal(policy.assessmentDisplayFor(p).score, 73)
    assert.equal(policy.assessmentDisplayFor(p).state, 'approved')
    for (const sort of ['score', 'value', 'budget']) assert.equal(policy.isRankingCandidate(p, sort), true)
    const html = f.html('components/ShopScoreBadge.tsx', { product: p })
    assert.match(html, /TLL Label Score: 73 out of 100/)
    assert.match(html, /stroke-dasharray/)
    assert.equal(f.load('lib/products.ts').withScore(p).score, 73)
  }
  const rows = [make({ id: 'unapproved', score: 100 }), make({ score: 1 })]
  const sorted = f.load('lib/products.ts').sortScored(rows, 'score')
  assert.equal(sorted[0].id, 'research'); assert.equal(sorted[0].score, 73)
  assert.equal(rows[1].score, 1, 'Sorting must not mutate source rows')
  assert.equal(policy.hasApprovedAssessment(make({ id: 'different' })), false)
  for (const cost_per_serving of [null, 0, -1, NaN]) {
    assert.equal(policy.isRankingCandidate(make({ cost_per_serving }), 'value'), false)
  }
})

for (const [field, values] of Object.entries({
  science_reviewer: [undefined, null, '', 'Oath'], compliance_reviewer: [undefined, '', 'Assay'],
  science_date: [undefined, '', '2026-02-30', '2025-02-29', '2026-1-01', '2026-10-16T00:00:00Z'],
  compliance_date: [undefined, null, 'not-a-date', '2026-13-01', '2026-04-31'],
  score: [undefined, null, 0, .5, 101, NaN, Infinity, '73'], key: [undefined, null, '', ' '], notes: [undefined, null, 42],
})) test(`invalid review field ${field} is ignored at load`, () => {
  for (const value of values) {
    const policy = withReviews([signedAssessment({ [field]: value })]).load('lib/assessment-display.ts')
    assert.equal(policy.hasApprovedAssessment(make()), false, `${field}: ${value}`)
    assert.equal(policy.assessmentDisplayFor(make()).score, null)
  }
})

test('invalid dataset shapes and rows are ignored; valid rows still work', () => {
  for (const records of [{}, 'invalid', 42, [null, [], {}, 'invalid']]) {
    assert.equal(withReviews(records).load('lib/assessment-display.ts').hasApprovedAssessment(make()), false)
  }
  for (const score of [1, 100]) {
    const policy = withReviews([null, {}, signedAssessment({ score, science_date: '2024-02-29' })]).load('lib/assessment-display.ts')
    assert.equal(policy.assessmentDisplayFor(make()).score, score)
  }
})

test('claims-review category holds override fully signed records', () => {
  const policy = withReviews([signedAssessment()]).load('lib/assessment-display.ts')
  for (const category of holds) {
    const p = make({ category })
    assert.equal(policy.hasApprovedAssessment(p), false)
    assert.equal(policy.assessmentDisplayFor(p).state, 'under_review')
    assert.equal(policy.assessmentDisplayFor(p).score, null)
    assert.equal(policy.isRankingCandidate(p, 'score'), false)
  }
})

test('ranking, awards and public API use reviewed scores rather than conflicting legacy values', async () => {
  const rows = [make({ id: 'research', score: 99 }), make({ id: 'second', score: 1, name: 'Second formula' })]
  const records = [signedAssessment({ score: 40 }), signedAssessment({ key: 'second', score: 90 })]
  const f = fixture(rows, {}, false, false, null, null, records)
  const sorted = f.load('lib/products.ts').sortScored(rows, 'score')
  assert.deepEqual(Array.from(sorted, p => [p.id, p.score]), [['second', 90], ['research', 40]])
  const awards = f.load('lib/best-categories.ts').deriveAwards(rows)
  assert.equal(awards.bestOverall.id, 'second')
  assert.equal(awards.bestValue.id, 'second')
  const api = f.load('app/api/ard/compare/route.ts')
  const json = await (await api.GET(new Request('https://fixture.invalid/api/ard/compare?category=creatine&sort=score'))).json()
  assert.deepEqual(json.results.map(p => [p.id, p.score, p.rank, p.assessment_state]), [
    ['second', 90, 1, 'approved'], ['research', 40, 2, 'approved'],
  ])
})


test('review register contains exactly the three authorised product IDs and scores', () => {
  const records = JSON.parse(readFileSync(new URL('../data/reviewed-assessments.json', import.meta.url), 'utf8'))
  assert.deepEqual(records.map(p => [p.key, p.score]), [
    ['738af0c5-bdfd-46be-890e-bd2d6e7cb21b', 79],
    ['6a8ebcdd-1505-4c9a-9adf-3682359bea61', 92],
    ['6aa54c84-8f33-4566-aa28-0fdcd5f7c96f', 79],
  ])
  for (const record of records) {
    assert.equal(record.science_reviewer, 'Assay'); assert.equal(record.compliance_reviewer, 'Oath')
    assert.equal(record.science_date, '2026-10-16'); assert.equal(record.compliance_date, '2026-10-16')
    assert.equal(fixture().load('lib/assessment-display.ts').assessmentDisplayFor({ id: record.key }).score, record.score)
  }
})

test('rings have the exact dated Rubric v1 tooltip and methodology link', () => {
  const copy = "TLL Label Score rates what's on the label, not the results you'll get. It compares stated doses with amounts used in published research and checks how transparent the label is. It isn't a health claim or medical advice. Source: brand label, checked 16 Oct 2026. Rubric v1. How we score"
  for (const source_url of [undefined, 'https://brand.example/label', 'javascript:alert(1)']) {
    const f = withReviews([signedAssessment({ source_url })])
    const html = f.html('components/ShopScoreBadge.tsx', { product: make({ score: 100 }) })
    const tooltip = html.match(/role="region"[^>]*>([\s\S]*?)<\/span>/)[1]
    const text = tooltip.replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'")
    assert.equal(text, copy)
    assert.match(tooltip, /Rubric v1\./)
    assert.match(tooltip, /href="\/methodology"/)
    assert.match(html, /Dose &amp; label check/)
    assert.equal(tooltip.includes('href="https://brand.example/label"'), source_url?.startsWith('https:') === true)
    assert.doesNotMatch(tooltip, /javascript:/)
    const surroundingCopy = html.replace(/role="region"[^>]*>[\s\S]*?<\/span>/, '')
    assert.doesNotMatch(surroundingCopy, /\b(effective|effectiveness|results|proven|best|healthy|evidence-based)\b/i)
    assert.match(html, /<button[^>]*type="button"[^>]*aria-controls=/)
    assert.match(html, /aria-label="TLL Label Score: 73 out of 100"/)
    assert.match(html, new RegExp(`<button[^>]*aria-label="TLL Label Score: 73 out of 100 Dose &amp; label check"`))
  }
  const pending = fixture().html('components/ShopScoreBadge.tsx', { product: make() })
  assert.match(pending, /<button[^>]*aria-label="TLL Label Score: Under review Dose &amp; label check"/)
  assert.match(pending, /compliance check pending/)
  assert.doesNotMatch(pending, /checked 16 Oct 2026/)
})

test('score cards and comparison copy avoid outcome claims around approved and pending scores', () => {
  for (const records of [[], [signedAssessment()]]) {
    const p = make(), f = withReviews(records)
    for (const [file, props] of [
      ['app/products/ProductGrid.tsx', { initialProducts: [p] }],
      ['app/products/[id]/ProductDetailPage.tsx', { product: p, related: [] }],
      ['app/compare/CompareView.tsx', { products: [p] }],
      ['components/FavouriteCard.tsx', { product: p }],
      ['components/TopProductsTable.tsx', { products: [p] }],
    ]) {
      const text = f.html(file, props).replace(/<[^>]*>/g, '').replace(/&#x27;/g, "'")
        .replaceAll("not the results you'll get", '')
      assert.doesNotMatch(text, /\b(effective|effectiveness|results|proven|best|healthy|evidence-based)\b/i, file)
    }
  }
})

test('score disclosure toggles on activation, retains focused links and restores focus on Escape', () => {
  let open = false, focused = 0
  const ref = { current: { focus() { focused++ } } }
  const hooks = { useId: () => 'disclosure-fixture', useRef: () => ref,
    useState: () => [open, next => { open = typeof next === 'function' ? next(open) : next }] }
  const f = fixture([], {}, false, false, null, null, [signedAssessment()], hooks)
  const badge = () => f.load('components/ShopScoreBadge.tsx').default({ product: make() })
  const region = () => badge().props.children[1]
  const button = () => badge().props.children[0]
  assert.equal(region().props.hidden, true)
  assert.equal(button().type, 'button', 'Native button provides Enter/Space activation')
  assert.equal(button().props.type, 'button')
  assert.equal(button().props['aria-controls'], region().props.id)
  assert.equal(region().props.role, 'region')
  assert.equal(region().props['aria-labelledby'], button().props.id)
  assert.equal(button().props['aria-describedby'], undefined)
  assert.equal(badge().props.onFocus, undefined)
  assert.equal(badge().props.onMouseLeave, undefined, 'Pointer exit must not close focused content')
  button().props.onClick(); assert.equal(open, true)
  assert.equal(button().props['aria-expanded'], true)
  assert.equal(region().props.hidden, false)
  badge().props.onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} }); assert.equal(open, true)
  let stopped = false
  badge().props.onKeyDown({ key: 'Escape', stopPropagation() { stopped = true } })
  assert.equal(open, false); assert.equal(stopped, true); assert.equal(focused, 1)
  button().props.onClick(); assert.equal(open, true)
  button().props.onClick(); assert.equal(open, false)
  button().props.onClick()
  badge().props.onBlur({ currentTarget: { contains: () => false }, relatedTarget: null }); assert.equal(open, false)
  const html = f.html('components/ShopScoreBadge.tsx', { product: make() })
  assert.match(html, /aria-hidden="true"[^>]*>TLL Label Score<\/span>/)
  assert.equal((html.match(/role="img"[^>]*aria-label="TLL Label Score:/g) || []).length, 1)
  assert.equal(button().props['aria-label'], 'TLL Label Score: 73 out of 100 Dose & label check')
})

test('legacy scores never survive public catalogue fetchers or product-page client props', async () => {
  const p = make({ score: 100 }), f = fixture([p, make({ id: 'related', score: 99 })])
  const data = f.load('lib/product-data.ts')
  for (const products of [await data.fetchCatalogue(), await data.fetchCategory(p.category), await data.fetchCompareProducts([p.id])]) {
    assert.ok(products.length > 0)
    assert.ok(products.every(row => row.score === null))
    assert.doesNotMatch(JSON.stringify(products), /"score":(?:100|99)/)
  }
  assert.equal((await data.fetchProductDetail(p.id)).score, null)
  // The page fixture deliberately returns raw rows, testing the actual RSC boundary too.
  const page = await f.load('app/products/[id]/page.tsx').default({ params: Promise.resolve({ id: p.id }) })
  const detail = page.props.children[1]
  assert.equal(detail.props.product.score, null)
  assert.ok(detail.props.related.every(row => row.score === null))
  assert.doesNotMatch(JSON.stringify(page), /"score":(?:100|99)/)
  assert.equal(p.score, 100, 'Projection must preserve the input object')
})


test('brand, grid, compare and versus server trees contain only display-safe product scores', async () => {
  const rows = [make({ score: 100 }), make({ id: 'second', name: 'Second formula', score: 99 })]
  const f = fixture(rows)
  const routes = [
    ['app/products/page.tsx', {}],
    ['app/brand/[slug]/page.tsx', { params: Promise.resolve({ slug: 'fixture' }) }],
    ['app/compare/page.tsx', { searchParams: Promise.resolve({ ids: 'research,second' }) }],
    ['app/vs/[matchup]/page.tsx', { params: Promise.resolve({ matchup: 'fixture-research-formula-vs-fixture-second-formula' }) }],
  ]
  for (const [file, props] of routes) {
    const tree = await f.load(file).default(props)
    const json = JSON.stringify(tree)
    assert.doesNotMatch(json, /"score":(?:100|99)/, file)
    assert.match(json, /"score":null/, file)
    assert.doesNotMatch(json, /ratingValue[^,}]*100/, file)
  }
})


test('PER4M Isolate Zero has no score, ring or pending teaser; EAA Xtra keeps its score', () => {
  const product = make({ id: 'a0fc6933-db03-4c34-a446-a9f89515a206', brand: 'Per4m', name: 'Isolate Zero', category: 'whey', score: 75 })
  const f = fixture([product])
  const policy = f.load('lib/assessment-display.ts')
  assert.equal(policy.hasApprovedAssessment(product), false)
  assert.equal(policy.displaySafeProduct(product).score, null)
  for (const file of ['components/ShopScoreBadge.tsx', 'components/ProductAssessment.tsx']) {
    assert.equal(f.html(file, { product }), '')
  }
  for (const [file, props] of [
    ['app/products/[id]/ProductDetailPage.tsx', { product, related: [] }],
    ['app/products/ProductGrid.tsx', { initialProducts: [product] }],
    ['components/FavouriteCard.tsx', { product }],
  ]) {
    const html = f.html(file, props)
    assert.match(html, /Isolate Zero/)
    assert.doesNotMatch(html, /Score Explained|Under review|compliance check pending|Dose &amp; label check|75\/100/)
  }
  assert.equal(f.load('lib/stack-assessment.ts').assessmentText(product), 'Brand label information only')
  const eaa = f.html('components/ShopScoreBadge.tsx', { product: make({ id: '6aa54c84-8f33-4566-aa28-0fdcd5f7c96f' }) })
  assert.match(eaa, /TLL Label Score: 79 out of 100/)
})
