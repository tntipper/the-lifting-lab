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
      in() { return this }, order() { return this }, single() { return Promise.resolve({ data: data[0], error: null }) },
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
  assert.match(html, /Not assessed/); assert.doesNotMatch(html, /80\/100|80%|Legacy score|Top Pick|🥇|Excellent dosing|Good dosing|ATP resynthesis/)
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
  assert.deepEqual(json.results.map(p => [p.id, p.rank, p.assessment_state]), [['zero', null, 'unassessed'], ['unknown', null, 'unassessed'], ['legacy', null, 'legacy']])
  assert.ok(json.results.every(p => p.buy_url === null && p.retailer_url === null))
  const held = fixture([make({ category: 'zma', score: 99 })])
  const heldJson = await (await held.load('app/api/ard/compare/route.ts').GET(new Request('https://fixture.invalid/api/ard/compare?category=zma&sort=score'))).json()
  assert.equal(heldJson.results[0].rank, null); assert.equal(heldJson.results[0].score, null)
  assert.equal(heldJson.results[0].assessment_state, 'under_review')
  const spec = await (await f.load('app/api/ard/openapi.json/route.ts').GET()).json()
  assert.equal(spec.components.schemas.RankedProduct.properties.rank.type, 'null'); assert.ok(json.results.every(p => p.recommendation_status === 'unavailable'))
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
    assert.match(html, /Not assessed/); assert.doesNotMatch(html, /95\/100|95%/)
    assert.doesNotMatch(html, /🥇|🥈|🥉|🏆|Top Pick|Best rated|wins on|Excellent dosing|Good dosing|full 5g effective|Green = meets dose|ATP resynthesis|Only available legacy scores/)
    const assessment = html.match(/<[^>]*data-assessment="legacy"[^>]*>/)?.[0]
    assert.ok(assessment, file); assert.match(assessment, /text-lab-muted/)
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
  assert.equal(products[0].score, null); assert.equal(products[0].assessment_state, 'legacy')
  assert.equal(products[0].recommendation_status, 'unavailable'); assert.match(products[0].assessment_note, /withheld/i)
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
