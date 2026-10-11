/**
 * Stage 4 / G11 — commercial catalogue eligibility must never grant scientific approval.
 *
 * Shop sellable / eligible-to-list / Effectiveness Match ≥50 listing rules are commercial
 * surfaces. They must not set or imply hasApprovedAssessment, medals, category awards, or
 * /best recommendation eligibility. Network-free; synthetic fixtures only.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'
import ts from 'typescript'
import { evaluateCatalogueEligibility } from '../lib/commerce/catalogue-eligibility.ts'
import { SUPPLIER_DELIVERY_TARIFF_VERSION } from '../lib/commerce/pricing-policy.ts'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
/** Normative TLL listing threshold from docs/ops/TLL-SHOP-CATALOGUE-POLICY.md — listing ≠ endorsement. */
const MATCH_LISTING_THRESHOLD = 50
const NOW = 1_800_000_000_000

const cache = new Map()
function load(relative) {
  const filename = path.resolve(ROOT, relative)
  if (cache.has(filename)) return cache.get(filename)
  const js = ts.transpileModule(readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const mod = { exports: {} }
  const localRequire = (name) => {
    if (name === '@/lib/supabase-public') {
      return {
        createPublicClient: () => ({
          from() {
            return {
              select() { return this },
              eq() { return this },
              then(done) { return Promise.resolve({ data: [], error: null }).then(done) },
            }
          },
        }),
      }
    }
    if (name.startsWith('@/') || name.startsWith('.')) {
      const basePath = name.startsWith('@/')
        ? path.join(ROOT, name.slice(2))
        : path.resolve(path.dirname(filename), name)
      const hit = [basePath + '.ts', basePath + '.tsx'].find(existsSync)
      assert.ok(hit, `Unexpected dependency: ${name}`)
      return load(path.relative(ROOT, hit))
    }
    return require(name)
  }
  vm.runInNewContext(
    js,
    {
      require: localRequire,
      module: mod,
      exports: mod.exports,
      process: { env: {} },
      URL,
      URLSearchParams,
      fetch() { throw new Error('Outbound requests forbidden') },
    },
    { filename },
  )
  cache.set(filename, mod.exports)
  return mod.exports
}

const {
  assessmentDisplayFor,
  hasApprovedAssessment,
  isRankingCandidate,
} = load('lib/assessment-display.ts')
const { deriveAwards } = load('lib/best-categories.ts')
const { scoreFor } = load('lib/scores.ts')

function review(version = 'v1') {
  return {
    approved: true,
    version,
    expectedVersion: version,
    verifiedAtMs: NOW - 1000,
    expiresAtMs: NOW + 10_000,
  }
}

function identity() {
  return {
    formulaId: 'formula-a',
    formulaVersion: 'formula-v2',
    flavourId: 'vanilla',
    labelVersion: 'label-v3',
    pack: {
      version: 'pack-v4',
      sellingUnit: 'single',
      innerCount: 1,
      amountPerInner: 500,
      unit: 'g',
    },
  }
}

/** Commercially complete own-shop offer. Research defaults to endorsed so both commerce + catalogue research can pass without elevating public assessment approval. */
function catalogueFixture(overrides = {}) {
  const item = identity()
  const base = {
    evaluatedAtMs: NOW,
    requestedQuantity: 1,
    policy: {
      review: review('catalogue-policy-1'),
      ownShopOrigin: 'https://shop.example.invalid',
      productPathPrefix: '/products/',
      maxStockAgeMs: 60_000,
      maxPriceAgeMs: 300_000,
      expectedPricingPolicyVersion: 'pricing-policy-1',
      expectedPaymentTariffVersion: 'payment-1',
      expectedSupplierDeliveryTariffVersion: SUPPLIER_DELIVERY_TARIFF_VERSION,
    },
    product: {
      id: 'product-a',
      status: 'active',
      publication: 'research_and_shop',
      identity: item,
      score: 99,
    },
    mapping: {
      review: review('mapping-1'),
      productId: 'product-a',
      shopifyProductId: 'gid://shopify/Product/2001',
      shopifyProductHandle: 'product-a',
      shopifyVariantId: 'gid://shopify/ProductVariant/1001',
      supplierSku: 'SYNTHETIC-SKU-A',
      status: 'exact',
      source: 'verified_labels',
      shopIdentity: structuredClone(item),
      supplierIdentity: structuredClone(item),
    },
    commerceLabel: {
      review: review('commerce-label-1'),
      formulaId: item.formulaId,
      formulaVersion: item.formulaVersion,
      flavourId: item.flavourId,
      labelVersion: item.labelVersion,
      packVersion: item.pack.version,
      source: 'manufacturer_label',
      requiredSellingInformationComplete: true,
    },
    cost: {
      review: review('cost-1'),
      shopifyVariantId: '1001',
      supplierSku: 'SYNTHETIC-SKU-A',
      mappingVersion: 'mapping-1',
      pricingPolicyVersion: 'pricing-policy-1',
      paymentTariffVersion: 'payment-1',
      dependencyValidity: { validFromMs: NOW - 1000, expiresAtMs: NOW + 10_000 },
      currency: 'GBP',
      allAttributableCostsKnown: true,
      taxTreatmentApproved: true,
      supplierDeliveryTariffVersion: SUPPLIER_DELIVERY_TARIFF_VERSION,
      supplierDeliveryBasis: 'one_item_supplier_order',
      supplierDeliveryStatus: 'charged',
      supplierDeliveryGrossCashPence: 600,
      wholesaleExVatPence: { numerator: '1000', denominator: '1' },
      minimumListPricePence: 2604,
    },
    price: {
      review: review('price-1'),
      observedAtMs: NOW - 1000,
      shopifyVariantId: '1001',
      mappingVersion: 'mapping-1',
      costVersion: 'cost-1',
      currency: 'GBP',
      amountPence: 3000,
    },
    stock: {
      review: review('stock-1'),
      observedAtMs: NOW - 1000,
      shopifyVariantId: '1001',
      supplierSku: 'SYNTHETIC-SKU-A',
      packVersion: item.pack.version,
      basis: 'reconciled_sellable_units',
      availableToSell: 10,
    },
    operator: { review: review('clearance-1'), commerce: 'clear', research: 'clear' },
    destination: {
      kind: 'own_shop_exact',
      url: 'https://shop.example.invalid/products/product-a?variant=1001',
      productHandle: 'product-a',
    },
    researchContextId: 'healthy-adults-protein-intake',
    research: {
      review: review('assessment-1'),
      formulaId: item.formulaId,
      formulaVersion: item.formulaVersion,
      flavourId: item.flavourId,
      labelVersion: item.labelVersion,
      modelVersion: 'model-2',
      expectedModelVersion: 'model-2',
      evidenceVersion: 'evidence-3',
      expectedEvidenceVersion: 'evidence-3',
      contextId: 'healthy-adults-protein-intake',
      source: 'verified_label',
      independentReviewComplete: true,
      outcome: 'endorsed',
    },
    servingBasis: {
      review: review('servings-1'),
      formulaId: item.formulaId,
      formulaVersion: item.formulaVersion,
      flavourId: item.flavourId,
      labelVersion: item.labelVersion,
      packVersion: item.pack.version,
      source: 'verified_label',
      servingsPerSellableUnit: 20,
    },
  }
  return { ...base, ...overrides, product: { ...base.product, ...(overrides.product ?? {}) } }
}

function publicProduct(score, extra = {}) {
  return {
    id: 'commercial-fixture',
    brand: 'Fixture',
    name: 'Sellable Match candidate',
    category: 'creatine',
    score,
    cost_per_serving: 0.5,
    retail_price: 20,
    servings_per_container: 40,
    serving_size: 5,
    serving_unit: 'g',
    informed_sport: false,
    image_url: null,
    buy_url: 'https://shop.example.invalid/products/fixture?variant=1',
    proprietary_blend: false,
    amino_spiked: false,
    protein_yield: null,
    nutrients: [{ nutrient_name: 'creatine', amount: 5000, unit: 'mg' }],
    // Caller-forged commerce/research fields must not mint scientific approval.
    approved: true,
    sellable: true,
    evidenceRankingEligible: true,
    valueRankingEligible: true,
    recommendation_status: 'approved',
    assessment_status: 'approved',
    ...extra,
  }
}

function assertNoScientificApproval(product, label) {
  assert.equal(hasApprovedAssessment(product), false, `${label}: hasApprovedAssessment must stay false`)
  for (const sort of ['score', 'value', 'budget', 'name', 'brand', 'price']) {
    assert.equal(isRankingCandidate(product, sort), false, `${label}: ranking candidate via ${sort}`)
  }
  const awards = deriveAwards([product])
  assert.equal(awards.bestOverall, null, `${label}: bestOverall medal`)
  assert.equal(awards.bestValue, null, `${label}: bestValue medal`)
  assert.equal(awards.bestBudget, null, `${label}: bestBudget medal`)
  const display = assessmentDisplayFor(product)
  assert.notEqual(display.state, 'approved')
  assert.doesNotMatch(display.label, /approved|endorsed|research reviewed/i)
}

test('sellable catalogue offers never grant hasApprovedAssessment or medals', () => {
  const scores = [null, 0, 49, MATCH_LISTING_THRESHOLD, 70, 99, 100]
  for (const score of scores) {
    const input = catalogueFixture({ product: { score } })
    const result = evaluateCatalogueEligibility(input)
    assert.equal(result.liveEnabled, false)
    assert.equal(result.commerce.status, 'eligible', `score=${score} must remain commercially sellable`)
    assert.ok(result.purchaseTarget, `score=${score} must keep own-shop purchase target`)

    const product = publicProduct(score, {
      catalogueState: result.display.catalogueState,
      assessmentLabel: result.display.assessmentLabel,
      evidenceRankingEligible: result.evidenceRankingEligible,
      valueRankingEligible: result.valueRankingEligible,
      researchAssessmentState: result.research.assessmentState,
    })
    assertNoScientificApproval(product, `sellable score=${score}`)
  }
})

test('Match ≥50 listing eligibility does not restore /best awards or ranking placement', () => {
  const listed = [
    publicProduct(MATCH_LISTING_THRESHOLD),
    publicProduct(70),
    publicProduct(95, { category: 'whey' }),
    publicProduct(100, { category: 'pre-workout' }),
  ]
  for (const product of listed) {
    assert.ok(
      typeof product.score === 'number' && product.score >= MATCH_LISTING_THRESHOLD,
      'fixture must sit at or above the commercial listing threshold',
    )
    assertNoScientificApproval(product, `Match ${product.score}`)
  }
  const awards = deriveAwards(listed)
  assert.equal(awards.bestOverall, null)
  assert.equal(awards.bestValue, null)
  assert.equal(awards.bestBudget, null)
})

test('catalogue research-endorsed + commercially eligible still leaves public assessment unapproved', () => {
  const result = evaluateCatalogueEligibility(catalogueFixture({ product: { score: 99 } }))
  assert.equal(result.commerce.status, 'eligible')
  assert.equal(result.research.status, 'eligible')
  assert.equal(result.research.assessmentState, 'endorsed')
  assert.equal(result.evidenceRankingEligible, true)
  assert.equal(result.valueRankingEligible, true)
  assert.equal(result.display.assessmentLabel, 'Research reviewed')

  // Catalogue research eligibility is a shop gate, not the public scientific approval gate.
  const product = publicProduct(99, {
    evidenceRankingEligible: result.evidenceRankingEligible,
    valueRankingEligible: result.valueRankingEligible,
    researchAssessmentState: result.research.assessmentState,
    assessmentLabel: result.display.assessmentLabel,
  })
  assertNoScientificApproval(product, 'catalogue-endorsed sellable')
  assert.equal(assessmentDisplayFor(product).state, 'legacy')
})

test('commercially sellable unassessed shop products stay unapproved for recommendations', () => {
  const input = catalogueFixture({ research: null, product: { score: 88 } })
  const result = evaluateCatalogueEligibility(input)
  assert.equal(result.commerce.status, 'eligible')
  assert.equal(result.research.assessmentState, 'unassessed')
  assert.equal(result.display.assessmentLabel, 'Not assessed')
  assert.equal(result.evidenceRankingEligible, false)
  assertNoScientificApproval(publicProduct(88, { sellable: true }), 'sellable unassessed')
})

test('shop-only publication never inherits scientific recommendation eligibility', () => {
  const result = evaluateCatalogueEligibility(
    catalogueFixture({ product: { publication: 'shop_only', score: 91 } }),
  )
  assert.equal(result.commerce.status, 'eligible')
  assert.equal(result.display.catalogueState, 'shop_only')
  assert.equal(result.research.assessmentState, 'not_listed')
  assert.equal(result.evidenceRankingEligible, false)
  assert.equal(result.valueRankingEligible, false)
  assertNoScientificApproval(publicProduct(91, { publication: 'shop_only' }), 'shop-only')
})

test('frozen Effectiveness Match values at or above 50 do not mint scientific approval', () => {
  // Sample known catalogue keys; do not invent scores — only read frozen table entries.
  const samples = [
    ['Bulk', 'Creatine Monohydrate'],
    ['MyProtein', 'Impact Creatine'],
    ['Optimum Nutrition', 'Gold Standard 100% Whey'],
    ['Bulk', 'Electrolyte Powder'],
  ]
  let sawAtLeastOneListed = false
  for (const [brand, name] of samples) {
    const score = scoreFor(brand, name)
    assert.equal(typeof score, 'number', `missing frozen score for ${brand}|${name}`)
    if (score >= MATCH_LISTING_THRESHOLD) sawAtLeastOneListed = true
    assertNoScientificApproval(
      publicProduct(score, { brand, name, id: `${brand}:${name}` }),
      `frozen ${brand} / ${name} (${score})`,
    )
  }
  assert.equal(sawAtLeastOneListed, true, 'expected at least one frozen Match ≥50 sample')
})

test('source containment: eligibility paths must not redefine the public approval gate', () => {
  const assessmentSrc = readFileSync(path.join(ROOT, 'lib/assessment-display.ts'), 'utf8')
  const eligibilitySrc = readFileSync(path.join(ROOT, 'lib/commerce/catalogue-eligibility.ts'), 'utf8')
  const bestSrc = readFileSync(path.join(ROOT, 'lib/best-categories.ts'), 'utf8')
  const scoringUtilsSrc = readFileSync(path.join(ROOT, 'lib/scoring-utils.ts'), 'utf8')
  const policySrc = readFileSync(path.join(ROOT, 'docs/ops/TLL-SHOP-CATALOGUE-POLICY.md'), 'utf8')

  assert.match(
    assessmentSrc,
    /export function hasApprovedAssessment[\s\S]*?\breturn false\b/,
  )
  assert.doesNotMatch(
    assessmentSrc,
    /export function hasApprovedAssessment[\s\S]*?\breturn true\b|export function hasApprovedAssessment[\s\S]*?score\s*>=\s*50/,
  )
  assert.doesNotMatch(assessmentSrc, /sellable|evidenceRankingEligible/)
  assert.doesNotMatch(eligibilitySrc, /hasApprovedAssessment|assessment-display|publishable:\s*true/)
  assert.match(bestSrc, /filter\(hasApprovedAssessment\)/)
  assert.match(bestSrc, /score\s*>=\s*50/)
  assert.doesNotMatch(scoringUtilsSrc, /hasApprovedAssessment|publishable:\s*true/)
  assert.match(policySrc, /Effectiveness Match score ≥ 50\/100/)
  assert.match(policySrc, /Do \*\*not\*\* invent Effectiveness Match scores/)
})

