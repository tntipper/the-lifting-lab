import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeQuantity, normalizeDeclaredDose, scaleQuantity, deriveMassFraction, validateFormula,
  evidenceManifest, validateAssessment, commercialValue, adaptLegacyScores } from '../lib/scoring-foundation.ts'
import { PRODUCT_SCORES } from '../lib/scores.ts'

const now = 1_800_000_000_000
const source = (id = 'label', kind = 'manufacturer_label') => ({ id, kind,
  url: `https://example.test/${id}`, contentHash: 'a'.repeat(64), version: 'fixture-v1', capturedAt: now - 3000, locator: 'Synthetic page 1' })
const verified = value => ({ status: 'verified', value, sourceIds: ['label'] })
const amount = (value, unit) => ({ value, unit })
const dose = (value = '50', unit = 'mcg') => ({ primary: amount(value, unit), equivalents: [] })
const formula = () => ({ productId: 'synthetic-product', variantId: 'synthetic-variant', formulaId: 'synthetic-formula', version: 'v1',
  flavour: verified('unflavoured'), sources: [source()],
  verification: { transcribedBy: 'transcriber-1', reviewedBy: 'reviewer-2', reviewedAt: now - 2000 },
  serving: verified(dose('1', 'count')), dailyServings: verified('1'), dailyDirections: verified('Synthetic one serving daily'),
  allergens: verified([]), warnings: verified(['Synthetic warning retained']), blendDisclosure: verified('fully_disclosed'),
  ingredients: [{ id: 'd3', substanceId: 'vitamin-d3', form: verified('cholecalciferol'), standardisation: verified('No standardisation claim on synthetic label'), ratio: verified({ kind: 'not_stated' }), amountKind: 'active', basis: 'per_serving',
    dose: verified({ primary: amount('50', 'mcg'), equivalents: [amount('2,000', 'IU')] }), includes: verified([]) }] })
const context = () => ({ formula: formula(), evidenceSources: [source('trial', 'human_research')], evidenceRevision: 'evidence-v1', modelVersion: 'intake-v1', now })
const valid = result => { assert.equal(result.status, 'valid', JSON.stringify(result)); return result.value }
const hasIssue = (result, code) => { assert.notEqual(result.status, 'valid'); assert.ok(result.issues.some(item => item.code === code), JSON.stringify(result)) }
const assessment = (ctx = context()) => ({ id: 'synthetic-review', formulaHash: valid(validateFormula(ctx.formula, now)).formulaHash,
  evidenceHash: valid(evidenceManifest(ctx.evidenceSources, ctx.evidenceRevision, now)).evidenceHash, modelVersion: ctx.modelVersion,
  outcome: { id: 'synthetic-outcome', population: 'Synthetic population', intervention: 'Synthetic preparation', comparator: 'Synthetic comparator', duration: 'Synthetic duration' },
  category: 'promising_or_mixed', confidence: 'low', formulaMatch: 'partly_matches', rationale: 'Synthetic rationale; no clinical finding',
  limitations: ['Synthetic fixture does not establish efficacy'], funding: 'Synthetic funding disclosure', reviewedBy: 'research-reviewer', reviewedAt: now - 1000, expiresAt: now + 1000 })

test('SI dimensions use exact rational quantities while preserving the label display', () => {
  const quantities = [amount('5', 'g'), amount('5,000', 'mg'), amount('5000000', 'mcg'), amount('0.005', 'kg')].map(item => valid(normalizeQuantity(item)))
  for (const quantity of quantities) assert.deepEqual(quantity.amount, { numerator: '5000', denominator: '1' })
  assert.equal(quantities[0].original.unit, 'g')
  assert.equal(quantities[1].original.value, '5,000')
  assert.deepEqual(valid(normalizeQuantity(amount('1,000', 'mg'))).amount, { numerator: '1000', denominator: '1' })
  assert.deepEqual(valid(normalizeQuantity(amount('0.000001', 'g'))).amount, { numerator: '1', denominator: '1000' })
  for (const unit of ['mcg', 'µg', 'μg']) assert.deepEqual(valid(normalizeQuantity(amount('50', unit))).amount, { numerator: '1', denominator: '20' })
  assert.equal(valid(normalizeQuantity(amount('1', 'l'))).unit, 'ml')
  assert.equal(valid(normalizeQuantity(amount('1', 'count'), 'tablet')).identity, 'tablet')
})

for (const value of [undefined, null, '']) test(`unknown amount remains missing: ${String(value)}`, () => {
  assert.equal(normalizeQuantity(amount(value, 'mg')).status, 'missing')
})
for (const value of ['-4', '-0', 0, 5, false, NaN, Infinity, '1,00', '00', '1 000', '1e3', '2:1', 'MK-4', '50 mcg (2000 IU)', '8g', '1/2', '1–2', '1.0000000001', ' 5', '5\n']) {
  test(`ambiguous or invalid amount is never rescued: ${String(value)}`, () => hasIssue(normalizeQuantity(amount(value, 'mg')), 'DECIMAL_INVALID'))
}
for (const unit of ['MG', 'IU/ml', 'enzyme', 'mg/serving', '__proto__', 'toString', 'unknown']) test(`unsupported unit is held: ${unit}`, () => {
  hasIssue(normalizeQuantity(amount('5', unit)), 'UNIT_UNSUPPORTED')
})

test('mass, volume, count, activity and different activities cannot be equated', () => {
  for (const [primary, other, identity] of [
    [amount('1', 'mg'), amount('1', 'ml'), 'ingredient'],
    [amount('1', 'mg'), amount('1', 'count'), 'tablet'],
    [amount('1', 'mg'), amount('1', 'IU'), 'vitamin-a'],
    [amount('1', 'mg'), amount('1', 'CFU'), 'strain-1'],
    [amount('1', 'IU'), amount('1', 'CFU'), 'strain-1'],
  ]) hasIssue(normalizeDeclaredDose({ primary, equivalents: [other] }, identity), 'DECLARATIONS_CONFLICT')
  assert.equal(normalizeQuantity(amount('5', 'CFU')).status, 'missing')
  assert.equal(normalizeQuantity(amount('5', 'count')).status, 'missing')
})

test('vitamin D conversion is identity-specific and dual units count only once', () => {
  for (const identity of ['vitamin-d2', 'vitamin-d3']) {
    const result = valid(normalizeDeclaredDose({ primary: amount('2,000', 'IU'), equivalents: [amount('50', 'mcg'), amount('0.05', 'mg')] }, identity))
    assert.deepEqual(result.amount, { numerator: '1', denominator: '20' })
    assert.equal(result.conversionRule, 'vitamin-d-40-iu-per-mcg-v1')
  }
  for (const identity of ['vitamin-a', 'vitamin-e', 'calcifediol', 'vitamin-d', 'unspecified']) {
    assert.equal(valid(normalizeQuantity(amount('2000', 'IU'), identity)).dimension, 'activity')
  }
  hasIssue(normalizeDeclaredDose({ primary: amount('50', 'mcg'), equivalents: [amount('50', 'IU')] }, 'vitamin-d3'), 'DECLARATIONS_CONFLICT')
  assert.equal(normalizeDeclaredDose({ primary: amount('50', 'mcg') }, 'vitamin-d3').status, 'missing')
})

test('explicit zero servings contributes zero; unknown amounts and multipliers remain unknown', () => {
  assert.deepEqual(valid(scaleQuantity(amount('5', 'g'), '0')).amount, { numerator: '0', denominator: '1' })
  assert.deepEqual(valid(scaleQuantity(amount('5', 'g'), '0.5')).amount, { numerator: '2500', denominator: '1' })
  assert.equal(scaleQuantity(undefined, '0').status, 'missing')
  assert.equal(scaleQuantity(amount('5', 'g'), undefined).status, 'missing')
  hasIssue(scaleQuantity(amount('5', 'g'), '-1'), 'DECIMAL_INVALID')
  assert.deepEqual(valid(normalizeQuantity(amount('0', 'mg'))).amount, { numerator: '0', denominator: '1' })
})

test('mass ratios stay separate from form text and do not become chemical or elemental assumptions', () => {
  const compound = unit => ({ amount: amount('8', unit), amountKind: 'compound', compoundId: 'synthetic-compound' })
  const ratio = (constituentParts, otherParts) => verified({ basis: 'mass', compoundId: 'synthetic-compound', constituentId: 'synthetic-constituent', constituentParts, otherParts })
  assert.deepEqual(valid(deriveMassFraction(compound('g'), ratio('1', '1'), ['label'])).amount, { numerator: '4000', denominator: '1' })
  const twoToOne = valid(deriveMassFraction(compound('g'), ratio('2', '1'), ['label']))
  assert.deepEqual(twoToOne.amount, { numerator: '16000', denominator: '3' })
  assert.equal(twoToOne.derivation.constituentId, 'synthetic-constituent')
  const molar = ratio('2', '1'); molar.value.basis = 'molar'
  hasIssue(deriveMassFraction(compound('g'), molar, ['label']), 'MASS_RATIO_REQUIRED')
  hasIssue(deriveMassFraction(compound('g'), ratio('0', '1'), ['label']), 'POSITIVE_PARTS_REQUIRED')
  hasIssue(deriveMassFraction(compound('ml'), ratio('2', '1'), ['label']), 'MASS_REQUIRED')
  hasIssue(deriveMassFraction(compound('g'), ratio('2', '1'), ['other-label']), 'SOURCE_BINDING_INVALID')
  hasIssue(deriveMassFraction({ ...compound('g'), amountKind: 'elemental' }, ratio('2', '1'), ['label']), 'COMPOUND_AMOUNT_REQUIRED')
  hasIssue(deriveMassFraction({ ...compound('g'), compoundId: 'other' }, ratio('2', '1'), ['label']), 'COMPOUND_BINDING_INVALID')
  assert.equal(deriveMassFraction(compound('g'), { status: 'missing', reason: 'ratio not verified' }, ['label']).status, 'missing')
})

for (const category of ['creatine', 'hormone', 'gut', 'vitamin', 'eaa', 'protein', 'hydration']) test(`empty ${category} has no favourable default`, () => {
  const result = validateFormula({ category }, now)
  assert.equal(result.status, 'missing')
  assert.equal(Object.hasOwn(result, 'value'), false)
  assert.equal(validateAssessment({}, { ...context(), formula: { category } }).status === 'valid', false)
})

test('a fully attributed synthetic formula is canonical, deterministic, immutable and still unpublished', () => {
  const input = formula(), before = structuredClone(input)
  const result = valid(validateFormula(input, now))
  assert.deepEqual(input, before)
  assert.match(result.formulaHash, /^[a-f0-9]{64}$/)
  assert.equal(result.publishable, false)
  assert.equal(result.verificationStatus, 'recorded_label_review')
  assert.equal(result.ingredients[0].form.value, 'cholecalciferol')
  assert.deepEqual(result.warnings.value, ['Synthetic warning retained'])
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result)
  assert.equal(valid(validateFormula(Object.fromEntries(Object.entries(input).reverse()), now)).formulaHash, result.formulaHash)
  const mk4 = formula(); mk4.ingredients[0].form = verified('MK-4'); mk4.ingredients[0].substanceId = 'vitamin-k2'; mk4.ingredients[0].dose = verified(dose('100', 'mcg'))
  assert.equal(valid(validateFormula(mk4, now)).ingredients[0].form.value, 'MK-4')
})

const invalidFormulaMutations = [
  ['missing exact variant', row => { delete row.variantId }, 'REQUIRED'],
  ['missing flavour', row => { row.flavour = { status: 'missing', reason: 'not checked' } }, 'EVIDENCE_MISSING'],
  ['missing nutrient rows', row => { row.ingredients = [] }, 'REQUIRED'],
  ['negative dose', row => { row.ingredients[0].dose = verified(dose('-4', 'mg')) }, 'DECIMAL_INVALID'],
  ['unverified dose', row => { row.ingredients[0].dose.status = 'unverified' }, 'FIELD_STATUS_INVALID'],
  ['unknown dose pretending zero', row => { row.ingredients[0].dose = { status: 'missing', value: dose('0', 'mg'), reason: 'unknown' } }, 'UNKNOWN_HAS_VALUE'],
  ['missing elemental amount', row => { row.ingredients[0].dose = { status: 'missing', reason: 'compound only' } }, 'EVIDENCE_MISSING'],
  ['missing amount kind', row => { delete row.ingredients[0].amountKind }, 'REQUIRED'],
  ['missing serving', row => { delete row.serving }, 'FIELD_REQUIRED'],
  ['zero serving size', row => { row.serving = verified(dose('0', 'g')) }, 'POSITIVE_SERVING_SIZE_REQUIRED'],
  ['wrong dose basis', row => { row.ingredients[0].basis = 'per_day' }, 'ENUM_INVALID'],
  ['missing directions', row => { delete row.dailyDirections }, 'FIELD_REQUIRED'],
  ['missing warnings never becomes empty', row => { delete row.warnings }, 'FIELD_REQUIRED'],
  ['unbound source', row => { row.ingredients[0].dose.sourceIds = ['other-label'] }, 'SOURCE_BINDING_INVALID'],
  ['duplicate source refs', row => { row.ingredients[0].dose.sourceIds = ['label', 'label'] }, 'SOURCE_BINDING_INVALID'],
  ['duplicate source IDs', row => { row.sources.push(source()) }, 'DUPLICATE_SOURCE'],
  ['missing source hash', row => { delete row.sources[0].contentHash }, 'REQUIRED'],
  ['malformed source hash', row => { row.sources[0].contentHash = 'not-a-hash' }, 'HASH_INVALID'],
  ['source credentials', row => { row.sources[0].url = 'https://user:secret@example.test/label' }, 'SOURCE_URL_INVALID'],
  ['source future time', row => { row.sources[0].capturedAt = now + 1 }, 'SOURCE_IN_FUTURE'],
  ['old review', row => { row.verification.reviewedAt = now - 4000 }, 'REVIEW_TIME_INVALID'],
  ['same transcriber/reviewer', row => { row.verification.reviewedBy = row.verification.transcribedBy }, 'SECOND_PERSON_REQUIRED'],
  ['a trial cannot certify a label', row => { row.sources[0].kind = 'human_research' }, 'EXACT_LABEL_SOURCE_REQUIRED'],
  ['duplicate ingredient row', row => { row.ingredients.push(structuredClone(row.ingredients[0])) }, 'DUPLICATE_INGREDIENT'],
  ['self-containing nutrient', row => { row.ingredients[0].includes = verified(['d3']) }, 'COMPONENT_LINK_INVALID'],
  ['unknown constituent', row => { row.ingredients[0].includes = verified(['unknown']) }, 'COMPONENT_LINK_INVALID'],
]
for (const [name, mutate, code] of invalidFormulaMutations) test(`formula held: ${name}`, () => {
  const input = formula(); mutate(input); hasIssue(validateFormula(input, now), code)
})

test('sparse and malformed collections cannot silently omit evidence', () => {
  const input = formula()
  const sparse = [source()]; sparse.length = 2; sparse.disguised = true; input.sources = sparse
  hasIssue(validateFormula(input, now), 'ARRAY_INVALID')
  input.sources = [source()]; input.ingredients = Array(2)
  hasIssue(validateFormula(input, now), 'ARRAY_INVALID')
  assert.notEqual(validateFormula(undefined, NaN).status, 'valid')
  assert.notEqual(validateAssessment(null, null).status, 'valid')
  assert.notEqual(adaptLegacyScores(null, null).status, 'valid')
})

test('compound/elemental and total/component rows are preserved without summing twice', () => {
  const input = formula()
  input.ingredients = [
    { ...input.ingredients[0], id: 'compound', substanceId: 'magnesium-bisglycinate', form: verified('bisglycinate'), amountKind: 'compound', basis: 'per_serving', dose: verified(dose('1000', 'mg')), includes: verified(['elemental']) },
    { ...input.ingredients[0], id: 'elemental', substanceId: 'magnesium', form: verified('elemental declared on label'), amountKind: 'elemental', basis: 'per_serving', dose: verified(dose('100', 'mg')), includes: verified([]) },
  ]
  const result = valid(validateFormula(input, now))
  assert.equal(result.ingredients.find(row => row.id === 'compound').dose.value.amount.numerator, '1000')
  assert.equal(result.ingredients.find(row => row.id === 'elemental').dose.value.amount.numerator, '100')
  assert.equal(Object.hasOwn(result, 'safetyTotal'), false)
  assert.equal(Object.hasOwn(result, 'safe'), false)
  input.ingredients[1].includes = verified(['compound'])
  hasIssue(validateFormula(input, now), 'COMPONENT_CYCLE')
})

test('categorical records require current formula, evidence, model and contextual rationale', () => {
  const ctx = context(), input = assessment(ctx), before = structuredClone(input)
  const result = valid(validateAssessment(input, ctx))
  assert.deepEqual(input, before)
  assert.equal(result.category, 'promising_or_mixed')
  assert.equal(result.confidence, 'low')
  assert.equal(result.publishable, false)
  assert.equal(result.publicationStatus, 'unpublished_review_record')
  assert.equal(Object.hasOwn(result, 'score'), false)
  assert.equal(Object.hasOwn(result, 'effective'), false)
  assert.equal(Object.hasOwn(result, 'safe'), false)
  for (const [key, value] of [['score', 93], ['percentage', 100], ['brandBonus', true], ['price', 1], ['commission', 20], ['margin', 35], ['ownedBrand', true]]) {
    hasIssue(validateAssessment({ ...input, [key]: value }, ctx), 'UNSUPPORTED_ASSESSMENT_FIELD')
  }
  hasIssue(validateAssessment({ ...input, category: 'top_tier' }, ctx), 'ENUM_INVALID')
  hasIssue(validateAssessment({ ...input, confidence: 93 }, ctx), 'ENUM_INVALID')
  hasIssue(validateAssessment({ ...input, confidence: 'not_assessed' }, ctx), 'UNASSESSED_CANNOT_ENDORSE')
  hasIssue(validateAssessment({ ...input, limitations: [] }, ctx), 'REQUIRED')
  hasIssue(validateAssessment({ ...input, outcome: { ...input.outcome, population: null } }, ctx), 'REQUIRED')
  hasIssue(validateAssessment({ ...input, expiresAt: now }, ctx), 'REVIEW_TIME_INVALID')
  hasIssue(validateAssessment({ ...input, reviewedAt: now + 1 }, ctx), 'REVIEW_TIME_INVALID')
})

const identityChanges = [
  ['formula version', row => { row.version = 'v2' }],
  ['formula ID', row => { row.formulaId = 'different' }],
  ['variant', row => { row.variantId = 'other-pack' }],
  ['flavour', row => { row.flavour = verified('other-flavour') }],
  ['serving', row => { row.serving = verified(dose('2', 'count')) }],
  ['frequency', row => { row.dailyServings = verified('2') }],
  ['directions', row => { row.dailyDirections = verified('Synthetic revised directions') }],
  ['form', row => { row.ingredients[0].form = verified('changed form') }],
  ['standardisation', row => { row.ingredients[0].standardisation = verified('Synthetic changed standardisation') }],
  ['ratio', row => { row.ingredients[0].amountKind = 'compound'; row.ingredients[0].ratio = verified({ kind: 'mass_ratio', basis: 'mass', constituentId: 'synthetic-marker', constituentParts: '2', otherParts: '1' }) }],
  ['amount', row => { row.ingredients[0].dose = verified(dose('25', 'mcg')) }],
  ['kind', row => { row.ingredients[0].amountKind = 'compound' }],
  ['label bytes', row => { row.sources[0].contentHash = 'b'.repeat(64) }],
  ['label version', row => { row.sources[0].version = 'label-v2' }],
  ['label provenance', row => { row.sources[0].url = 'https://example.test/other-label' }],
  ['warning', row => { row.warnings = verified(['Synthetic changed warning']) }],
]
for (const [name, change] of identityChanges) test(`stale assessment rejected after ${name} changes`, () => {
  const ctx = context(), prior = assessment(ctx); change(ctx.formula)
  hasIssue(validateAssessment(prior, ctx), 'FORMULA_CHANGED')
})

test('new evidence content/revision and model invalidate old assessment lineage', () => {
  const ctx = context(), prior = assessment(ctx)
  hasIssue(validateAssessment(prior, { ...ctx, evidenceRevision: 'revision-2' }), 'EVIDENCE_CHANGED')
  const updated = structuredClone(ctx); updated.evidenceSources[0].contentHash = 'b'.repeat(64)
  hasIssue(validateAssessment(prior, updated), 'EVIDENCE_CHANGED')
  hasIssue(validateAssessment(prior, { ...ctx, modelVersion: 'model-2' }), 'MODEL_CHANGED')
  hasIssue(evidenceManifest([source('label')], 'v1', now), 'RESEARCH_SOURCE_REQUIRED')
})

test('formula identity binds ratio changes and rejects elemental or self-referential mass ratios', () => {
  const input = formula(), ingredient = input.ingredients[0]
  ingredient.substanceId = 'synthetic-compound'; ingredient.amountKind = 'compound'
  ingredient.dose = verified(dose('8', 'g'))
  ingredient.ratio = verified({ kind: 'mass_ratio', basis: 'mass', constituentId: 'synthetic-constituent', constituentParts: '1', otherParts: '1' })
  const oneToOne = valid(validateFormula(input, now))
  ingredient.ratio.value.constituentParts = '2'
  assert.notEqual(valid(validateFormula(input, now)).formulaHash, oneToOne.formulaHash)
  ingredient.amountKind = 'elemental'
  hasIssue(validateFormula(input, now), 'COMPOUND_AMOUNT_REQUIRED')
  ingredient.amountKind = 'compound'; ingredient.ratio.value.constituentId = ingredient.substanceId
  hasIssue(validateFormula(input, now), 'CONSTITUENT_ID_INVALID')
})

test('partial or unspecified formula cannot be called a full match', () => {
  for (const mutate of [row => { row.blendDisclosure = verified('partly_disclosed') }, row => { row.ingredients[0].amountKind = 'unspecified' }]) {
    const ctx = context(); mutate(ctx.formula)
    const input = assessment(ctx); input.formulaMatch = 'matches'
    hasIssue(validateAssessment(input, ctx), 'INCOMPLETE_FORMULA_CANNOT_MATCH')
    input.formulaMatch = 'cannot_verify'; assert.equal(validateAssessment(input, ctx).status, 'valid')
  }
})

const offer = () => ({ variantId: 'synthetic-variant', sourceId: 'synthetic-price-record', currency: 'GBP', priceMinor: 1234,
  verifiedServings: '30', observedAt: now - 1000, expiresAt: now + 1000 })
test('commercial value is separate, exact, time-bound and cannot alter scientific records', () => {
  const ctx = context(), input = assessment(ctx), baseline = valid(validateAssessment(input, ctx))
  const value = valid(commercialValue(offer(), now))
  assert.deepEqual(value.perServingMinor, { numerator: '617', denominator: '15' })
  assert.equal(value.scope, 'listed_pack_price_only')
  assert.equal(value.assessmentIndependent, true)
  assert.notDeepEqual(valid(commercialValue({ ...offer(), priceMinor: 2468 }, now)).perServingMinor, value.perServingMinor)
  const changed = structuredClone(ctx)
  Object.assign(changed.formula, { price: 1, creapure: true, commission: 99, margin: 99, ownedBrand: true })
  assert.deepEqual(valid(validateAssessment(input, changed)), baseline)
  assert.equal(commercialValue({}, now).status, 'missing')
  for (const priceMinor of [0, -1, 12.34, '1234', NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) hasIssue(commercialValue({ ...offer(), priceMinor }, now), 'PRICE_INVALID')
  hasIssue(commercialValue({ ...offer(), verifiedServings: '0' }, now), 'POSITIVE_SERVINGS_REQUIRED')
  hasIssue(commercialValue({ ...offer(), expiresAt: now }, now), 'VALUE_EXPIRED_OR_FUTURE')
  assert.equal(commercialValue({ ...offer(), priceMinor: undefined }, now).status, 'missing')
})

test('legacy migration preserves only historical numbers and exact keys, without aliases or assessment promotion', () => {
  const input = { 'Fixture|A': 93, 'Fixture|B': 100, 'Fixture|Zero': 0, 'Fixture|Unknown': null, 'Fixture|Bad': -4, 'Fixture|Text': '100' }
  const result = valid(adaptLegacyScores(input, { version: 'frozen-v1', sourcePath: 'lib/scores.ts' }))
  assert.deepEqual(result.rows.find(row => row.lookupKey === 'Fixture|Zero').historicalScore, { status: 'recorded', value: 0 })
  assert.equal(result.rows.find(row => row.lookupKey === 'Fixture|Unknown').historicalScore.status, 'missing')
  assert.equal(result.rows.find(row => row.lookupKey === 'Fixture|Bad').historicalScore.status, 'invalid')
  assert.equal(result.rows.find(row => row.lookupKey === 'Fixture|Text').historicalScore.status, 'invalid')
  for (const row of result.rows) {
    assert.equal(row.publishable, false); assert.equal(row.confidence, 'not_assessed'); assert.equal(row.formulaId, null); assert.equal(row.assessment, null)
  }
  const liveFrozenTable = valid(adaptLegacyScores(PRODUCT_SCORES, { version: 'repository-fixture-test', sourcePath: 'lib/scores.ts' }))
  assert.equal(liveFrozenTable.rows.length, Object.keys(PRODUCT_SCORES).length)
  assert.ok(liveFrozenTable.rows.every(row => row.recordType === 'legacy_unverified' && row.publishable === false && row.assessment === null))
  assert.equal(adaptLegacyScores({}, { version: 'v1', sourcePath: 'fixture' }).status, 'missing')
  assert.deepEqual(result.snapshot, valid(adaptLegacyScores(Object.fromEntries(Object.entries(input).reverse()), { version: 'frozen-v1', sourcePath: 'lib/scores.ts' })).snapshot)
})
