import { createHash } from 'node:crypto'

/** Intake contracts, not an efficacy model or permission to publish an assessment. */
export type EvidenceField<T> =
  | { status: 'verified'; value: T; sourceIds: string[] }
  | { status: 'missing'; reason: string }
  | { status: 'invalid'; reason: string }
export type Issue = { path: string; state: 'missing' | 'invalid'; code: string }
export type Validation<T> = { status: 'valid'; value: T } | { status: 'missing' | 'invalid'; issues: Issue[] }
export type Rational = { numerator: string; denominator: string }
export type QuantityInput = { value: string; unit: string }
export type DoseInput = { primary: QuantityInput; equivalents: QuantityInput[] }
export type RatioInput = { kind: 'not_stated' } | { kind: 'mass_ratio'; basis: 'mass'; constituentId: string; constituentParts: string; otherParts: string }
export type IngredientInput = {
  id: string; substanceId: string; form: EvidenceField<string>; standardisation: EvidenceField<string>; ratio: EvidenceField<RatioInput>
  amountKind: 'compound' | 'elemental' | 'active' | 'total' | 'unspecified'; basis: 'per_serving'
  dose: EvidenceField<DoseInput>; includes: EvidenceField<string[]>
}
export type FormulaInput = {
  productId: string; variantId: string; formulaId: string; version: string; flavour: EvidenceField<string>; sources: Source[]
  verification: { transcribedBy: string; reviewedBy: string; reviewedAt: number }
  serving: EvidenceField<DoseInput>; dailyServings: EvidenceField<string>; dailyDirections: EvidenceField<string>
  allergens: EvidenceField<string[]>; warnings: EvidenceField<string[]>
  blendDisclosure: EvidenceField<'fully_disclosed' | 'partly_disclosed' | 'undisclosed'>; ingredients: IngredientInput[]
}
export type AssessmentInput = {
  id: string; formulaHash: string; evidenceHash: string; modelVersion: string
  outcome: { id: string; population: string; intervention: string; comparator: string; duration: string }
  category: 'established_in_context' | 'promising_or_mixed' | 'insufficient'
  confidence: 'high' | 'moderate' | 'low' | 'very_low' | 'not_assessed'
  formulaMatch: 'matches' | 'partly_matches' | 'cannot_verify'; rationale: string; limitations: string[]; funding: string
  reviewedBy: string; reviewedAt: number; expiresAt: number
}
export type AssessmentContext = { formula: FormulaInput; evidenceSources: Source[]; evidenceRevision: string; modelVersion: string; now: number }
export type CommercialValueInput = {
  variantId: string; sourceId: string; currency: 'GBP'; priceMinor: number
  verifiedServings: string; observedAt: number; expiresAt: number
}
export type Quantity = {
  amount: Rational; dimension: 'mass' | 'volume' | 'count' | 'activity'; unit: 'mg' | 'ml' | 'count' | 'IU' | 'CFU'
  identity: string | null; original: QuantityInput; conversionRule: string
  derivation?: { compoundId: string; constituentId: string; sourceIds: string[]; fraction: Rational }
}
export const CONVERSION_SOURCES = {
  'si-prefixes-v1': 'https://www.bipm.org/en/measurement-units/si-prefixes',
  'vitamin-d-40-iu-per-mcg-v1': 'https://ods.od.nih.gov/factsheets/VitaminD-HealthProfessional/',
} as const

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object'
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
const issue = (issues: Issue[], path: string, code: string, state: Issue['state'] = 'invalid') => { issues.push({ path, state, code }) }
const absent = (value: unknown) => value === undefined || value === null || value === ''
function finish<T>(issues: Issue[], value: T): Validation<T> {
  return issues.length ? { status: issues.some(item => item.state === 'invalid') ? 'invalid' : 'missing', issues } : { status: 'valid', value }
}
function text(value: unknown, path: string, issues: Issue[], max = 2000): string {
  if (absent(value)) { issue(issues, path, 'REQUIRED', 'missing'); return '' }
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\x00-\x1f\x7f]/.test(value)) {
    issue(issues, path, 'TEXT_INVALID'); return ''
  }
  return value
}
function list(value: unknown, path: string, issues: Issue[], allowEmpty = false): unknown[] {
  if (absent(value) || (Array.isArray(value) && !value.length && !allowEmpty)) {
    issue(issues, path, 'REQUIRED', 'missing'); return []
  }
  if (!Array.isArray(value) || value.length > 1000 || Object.keys(value).length !== value.length
    || Array.from({ length: value.length }, (_, index) => index).some(index => !Object.hasOwn(value, index))) {
    issue(issues, path, 'ARRAY_INVALID'); return []
  }
  return value
}
function timestamp(value: unknown, path: string, issues: Issue[]): number {
  if (absent(value)) { issue(issues, path, 'REQUIRED', 'missing'); return 0 }
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) { issue(issues, path, 'TIME_INVALID'); return 0 }
  return value
}
function oneOf<T extends string>(value: unknown, choices: readonly T[], path: string, issues: Issue[]): T {
  if (absent(value)) issue(issues, path, 'REQUIRED', 'missing')
  else if (typeof value !== 'string' || !choices.includes(value as T)) issue(issues, path, 'ENUM_INVALID')
  return value as T
}
function sha(value: unknown): string {
  function ordered(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(ordered)
    if (record(item)) return Object.fromEntries(Object.keys(item).sort().map(key => [key, ordered(item[key])]))
    return item
  }
  return createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
}
function rational(numerator: bigint, denominator: bigint): Rational {
  let a = numerator, b = denominator
  while (b !== BigInt(0)) { const rest = a % b; a = b; b = rest }
  const divisor = a || BigInt(1)
  return { numerator: String(numerator / divisor), denominator: String(denominator / divisor) }
}
function decimal(value: unknown, path: string, issues: Issue[]): Rational | undefined {
  if (absent(value)) { issue(issues, path, 'AMOUNT_REQUIRED', 'missing'); return }
  // Explicit decimal strings only. Never parse a number from an ingredient name,
  // ratio, exponent, range, dual-unit label or locale-ambiguous grouping.
  if (typeof value !== 'string' || value.length > 48 || !/^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,9})?$/.test(value)) {
    issue(issues, path, 'DECIMAL_INVALID'); return
  }
  const [integer, fraction = ''] = value.replaceAll(',', '').split('.')
  return rational(BigInt(integer + fraction), BigInt(10) ** BigInt(fraction.length))
}
const multiply = (a: Rational, b: Rational) => rational(BigInt(a.numerator) * BigInt(b.numerator), BigInt(a.denominator) * BigInt(b.denominator))
const equivalent = (a: Quantity, b: Quantity) => a.dimension === b.dimension && a.unit === b.unit && a.identity === b.identity
  && a.amount.numerator === b.amount.numerator && a.amount.denominator === b.amount.denominator

/** A valid conversion asserts arithmetic and dimension only, never label verification. */
export function normalizeQuantity(input: unknown, substanceId?: string): Validation<Quantity> {
  const issues: Issue[] = []
  if (!record(input)) return finish([{ path: 'quantity', state: absent(input) ? 'missing' : 'invalid', code: 'QUANTITY_REQUIRED' }], undefined as never)
  const amount = decimal(input.value, 'quantity.value', issues)
  const unit = text(input.unit, 'quantity.unit', issues, 16)
  const mass: Record<string, [string, string]> = { kg: ['1000000', '1'], g: ['1000', '1'], mg: ['1', '1'], mcg: ['1', '1000'], 'µg': ['1', '1000'], 'μg': ['1', '1000'] }
  let dimension: Quantity['dimension'] = 'mass', canonicalUnit: Quantity['unit'] = 'mg', identity: string | null = null
  const factor: Rational = { numerator: '1', denominator: '1' }
  let conversionRule = 'si-prefixes-v1'
  if (Object.hasOwn(mass, unit)) [factor.numerator, factor.denominator] = mass[unit]
  else if (unit === 'ml' || unit === 'l') { dimension = 'volume'; canonicalUnit = 'ml'; factor.numerator = unit === 'l' ? '1000' : '1' }
  else if (unit === 'count') { dimension = 'count'; canonicalUnit = 'count'; identity = text(substanceId, 'quantity.countIdentity', issues, 200); conversionRule = 'identity-v1' }
  else if (unit === 'IU' || unit === 'CFU') {
    identity = text(substanceId, 'quantity.activityIdentity', issues, 200)
    dimension = 'activity'; canonicalUnit = unit; conversionRule = 'identity-v1'
    // This source-backed bridge applies only to labelled D2/D3, not every vitamin,
    // calcifediol, blood concentration or generic biological activity.
    if (unit === 'IU' && ['vitamin-d2', 'vitamin-d3'].includes(identity)) {
      dimension = 'mass'; canonicalUnit = 'mg'; identity = null
      factor.denominator = '40000'; conversionRule = 'vitamin-d-40-iu-per-mcg-v1'
    }
  } else if (unit) issue(issues, 'quantity.unit', 'UNIT_UNSUPPORTED')
  if (!amount || issues.length) return finish(issues, undefined as never)
  return finish(issues, { amount: multiply(amount, factor), dimension, unit: canonicalUnit, identity,
    original: { value: input.value as string, unit }, conversionRule })
}

/** Equivalent label declarations describe one amount; never sum the declarations. */
export function normalizeDeclaredDose(input: unknown, substanceId: string): Validation<Quantity> {
  if (!record(input)) return finish([{ path: 'dose', state: absent(input) ? 'missing' : 'invalid', code: 'DOSE_REQUIRED' }], undefined as never)
  const primary = normalizeQuantity(input.primary, substanceId)
  if (primary.status !== 'valid') return primary
  const issues: Issue[] = []
  for (const [index, item] of list(input.equivalents, 'dose.equivalents', issues, true).entries()) {
    const other = normalizeQuantity(item, substanceId)
    if (other.status !== 'valid') issues.push(...other.issues.map(entry => ({ ...entry, path: `dose.equivalents.${index}.${entry.path}` })))
    else if (!equivalent(primary.value, other.value)) issue(issues, `dose.equivalents.${index}`, 'DECLARATIONS_CONFLICT')
  }
  return finish(issues, primary.value)
}

export function scaleQuantity(input: unknown, servings: unknown, substanceId?: string): Validation<Quantity> {
  const quantity = normalizeQuantity(input, substanceId)
  const issues: Issue[] = [], multiplier = decimal(servings, 'servings', issues)
  if (quantity.status !== 'valid') issues.push(...quantity.issues)
  if (!multiplier || quantity.status !== 'valid' || issues.length) return finish(issues, undefined as never)
  return finish(issues, { ...quantity.value, amount: multiply(quantity.value.amount, multiplier) })
}

/** Only an explicitly verified mass ratio can support this arithmetic operation.
 * A chemical/molar ratio, compound name or elemental label cannot supply it. */
export function deriveMassFraction(input: unknown, ratioField: unknown, sourceIds: string[]): Validation<Quantity> {
  const issues: Issue[] = []
  const compound = record(input) ? input : {}
  if (compound.amountKind !== 'compound') issue(issues, 'compound.amountKind', 'COMPOUND_AMOUNT_REQUIRED')
  const compoundId = text(compound.compoundId, 'compound.compoundId', issues, 200)
  const quantity = normalizeQuantity(compound.amount)
  const refs = list(sourceIds, 'sourceIds', issues).map((id, index) => text(id, `sourceIds.${index}`, issues, 200))
  let constituentId = ''
  const ratio = field(ratioField, 'ratio', refs, issues, value => {
    if (!record(value)) { issue(issues, 'ratio.value', 'RATIO_INVALID'); return undefined }
    if (value.basis !== 'mass') issue(issues, 'ratio.basis', 'MASS_RATIO_REQUIRED')
    if (text(value.compoundId, 'ratio.compoundId', issues, 200) !== compoundId) issue(issues, 'ratio.compoundId', 'COMPOUND_BINDING_INVALID')
    constituentId = text(value.constituentId, 'ratio.constituentId', issues, 200)
    if (compoundId === constituentId) issue(issues, 'ratio.constituentId', 'CONSTITUENT_ID_INVALID')
    const constituent = decimal(value.constituentParts, 'ratio.constituentParts', issues)
    const other = decimal(value.otherParts, 'ratio.otherParts', issues)
    if (constituent?.numerator === '0' || other?.numerator === '0') issue(issues, 'ratio', 'POSITIVE_PARTS_REQUIRED')
    return constituent && other ? rational(BigInt(constituent.numerator) * BigInt(other.denominator),
      BigInt(constituent.numerator) * BigInt(other.denominator) + BigInt(other.numerator) * BigInt(constituent.denominator)) : undefined
  })
  if (quantity.status !== 'valid') issues.push(...quantity.issues)
  else if (quantity.value.dimension !== 'mass') issue(issues, 'quantity', 'MASS_REQUIRED')
  if (!ratio || quantity.status !== 'valid' || issues.length) return finish(issues, undefined as never)
  return finish(issues, { ...quantity.value, amount: multiply(quantity.value.amount, ratio.value!), conversionRule: 'verified-mass-fraction-v1',
    derivation: { compoundId, constituentId, sourceIds: ratio.sourceIds, fraction: ratio.value! } })
}

export type Source = {
  id: string; kind: 'manufacturer_label' | 'manufacturer_specification' | 'human_research' | 'guidance' | 'batch_report'
  url: string; contentHash: string; version: string; capturedAt: number; locator: string
}
function sources(input: unknown, now: number, issues: Issue[]): Source[] {
  const ids = new Set<string>()
  return list(input, 'sources', issues).map((item, index) => {
    const path = `sources.${index}`, raw = record(item) ? item : {}
    const id = text(raw.id, `${path}.id`, issues, 200)
    if (ids.has(id)) issue(issues, `${path}.id`, 'DUPLICATE_SOURCE')
    ids.add(id)
    const kind = oneOf(raw.kind, ['manufacturer_label', 'manufacturer_specification', 'human_research', 'guidance', 'batch_report'] as const, `${path}.kind`, issues)
    const url = text(raw.url, `${path}.url`, issues)
    try { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw new Error() }
    catch { if (url) issue(issues, `${path}.url`, 'SOURCE_URL_INVALID') }
    const contentHash = text(raw.contentHash, `${path}.contentHash`, issues, 64)
    if (contentHash && !/^[a-f0-9]{64}$/.test(contentHash)) issue(issues, `${path}.contentHash`, 'HASH_INVALID')
    const version = text(raw.version, `${path}.version`, issues, 200), locator = text(raw.locator, `${path}.locator`, issues)
    const capturedAt = timestamp(raw.capturedAt, `${path}.capturedAt`, issues)
    if (capturedAt > now) issue(issues, `${path}.capturedAt`, 'SOURCE_IN_FUTURE')
    return { id, kind, url, contentHash, version, capturedAt, locator }
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}
function field<T>(input: unknown, path: string, sourceIds: string[], issues: Issue[], decode: (value: unknown) => T): { value: T; sourceIds: string[] } | undefined {
  if (!record(input)) { issue(issues, path, 'FIELD_REQUIRED', absent(input) ? 'missing' : 'invalid'); return }
  if (input.status === 'missing' || input.status === 'invalid') {
    text(input.reason, `${path}.reason`, issues)
    issue(issues, path, input.status === 'missing' ? 'EVIDENCE_MISSING' : 'EVIDENCE_INVALID', input.status)
    if (Object.hasOwn(input, 'value')) issue(issues, path, 'UNKNOWN_HAS_VALUE')
    return
  }
  if (input.status !== 'verified') { issue(issues, path, 'FIELD_STATUS_INVALID'); return }
  const refs = list(input.sourceIds, `${path}.sourceIds`, issues).map((id, index) => text(id, `${path}.sourceIds.${index}`, issues, 200))
  if (new Set(refs).size !== refs.length || refs.some(id => !sourceIds.includes(id))) issue(issues, `${path}.sourceIds`, 'SOURCE_BINDING_INVALID')
  return { value: decode(input.value), sourceIds: refs.sort() }
}

export function validateFormula(input: unknown, now: number) {
  const issues: Issue[] = []
  timestamp(now, 'now', issues)
  const raw = record(input) ? input : {}
  if (!record(input) && !absent(input)) issue(issues, 'formula', 'OBJECT_REQUIRED')
  const sourceRecords = sources(raw.sources, now, issues)
  if (sourceRecords.some(source => !['manufacturer_label', 'manufacturer_specification'].includes(source.kind))) issue(issues, 'sources', 'EXACT_LABEL_SOURCE_REQUIRED')
  const sourceIds = sourceRecords.map(source => source.id)
  const read = <T,>(value: unknown, path: string, decode: (item: unknown) => T) => field(value, path, sourceIds, issues, decode)
  const stringField = (value: unknown, path: string) => read(value, path, item => text(item, `${path}.value`, issues))
  const doseField = (value: unknown, path: string, identity: string) => read(value, path, item => {
    const result = normalizeDeclaredDose(item, identity)
    if (result.status !== 'valid') { issues.push(...result.issues.map(entry => ({ ...entry, path: `${path}.${entry.path}` }))); return undefined }
    return result.value
  })
  const stringsField = (value: unknown, path: string) => read(value, path, item => list(item, `${path}.value`, issues, true).map((entry, index) => text(entry, `${path}.value.${index}`, issues)))
  const productId = text(raw.productId, 'productId', issues, 200), variantId = text(raw.variantId, 'variantId', issues, 200)
  const formulaId = text(raw.formulaId, 'formulaId', issues, 200), version = text(raw.version, 'version', issues, 200)
  const flavour = stringField(raw.flavour, 'flavour')
  const review = record(raw.verification) ? raw.verification : {}
  const transcribedBy = text(review.transcribedBy, 'verification.transcribedBy', issues, 200)
  const reviewedBy = text(review.reviewedBy, 'verification.reviewedBy', issues, 200)
  const reviewedAt = timestamp(review.reviewedAt, 'verification.reviewedAt', issues)
  if (transcribedBy && transcribedBy === reviewedBy) issue(issues, 'verification', 'SECOND_PERSON_REQUIRED')
  if (reviewedAt > now || sourceRecords.some(source => source.capturedAt > reviewedAt)) issue(issues, 'verification.reviewedAt', 'REVIEW_TIME_INVALID')
  const serving = doseField(raw.serving, 'serving', 'serving')
  if (serving?.value && (serving.value.dimension === 'activity' || serving.value.amount.numerator === '0')) issue(issues, 'serving', 'POSITIVE_SERVING_SIZE_REQUIRED')
  const dailyServings = read(raw.dailyServings, 'dailyServings', item => decimal(item, 'dailyServings.value', issues))
  const dailyDirections = stringField(raw.dailyDirections, 'dailyDirections')
  const allergens = stringsField(raw.allergens, 'allergens'), warnings = stringsField(raw.warnings, 'warnings')
  const blendDisclosure = read(raw.blendDisclosure, 'blendDisclosure', item => oneOf(item, ['fully_disclosed', 'partly_disclosed', 'undisclosed'] as const, 'blendDisclosure.value', issues))
  const ids = new Set<string>()
  const ingredients = list(raw.ingredients, 'ingredients', issues).map((item, index) => {
    const path = `ingredients.${index}`, row = record(item) ? item : {}
    const id = text(row.id, `${path}.id`, issues, 200), substanceId = text(row.substanceId, `${path}.substanceId`, issues, 200)
    if (ids.has(id)) issue(issues, `${path}.id`, 'DUPLICATE_INGREDIENT')
    ids.add(id)
    const form = stringField(row.form, `${path}.form`)
    const standardisation = stringField(row.standardisation, `${path}.standardisation`)
    const ratio = read(row.ratio, `${path}.ratio`, value => {
      if (!record(value)) { issue(issues, `${path}.ratio`, 'RATIO_INVALID'); return undefined }
      if (value.kind === 'not_stated') {
        if (Object.keys(value).length !== 1) issue(issues, `${path}.ratio`, 'UNSTATED_RATIO_HAS_VALUES')
        return { kind: 'not_stated' as const }
      }
      if (value.kind !== 'mass_ratio' || value.basis !== 'mass') issue(issues, `${path}.ratio`, 'MASS_RATIO_REQUIRED')
      const constituentId = text(value.constituentId, `${path}.ratio.constituentId`, issues, 200)
      if (row.amountKind !== 'compound') issue(issues, `${path}.ratio`, 'COMPOUND_AMOUNT_REQUIRED')
      if (constituentId === substanceId) issue(issues, `${path}.ratio.constituentId`, 'CONSTITUENT_ID_INVALID')
      const constituentParts = decimal(value.constituentParts, `${path}.ratio.constituentParts`, issues)
      const otherParts = decimal(value.otherParts, `${path}.ratio.otherParts`, issues)
      if (constituentParts?.numerator === '0' || otherParts?.numerator === '0') issue(issues, `${path}.ratio`, 'POSITIVE_PARTS_REQUIRED')
      return { kind: 'mass_ratio' as const, basis: 'mass' as const, constituentId, constituentParts, otherParts }
    })
    const amountKind = oneOf(row.amountKind, ['compound', 'elemental', 'active', 'total', 'unspecified'] as const, `${path}.amountKind`, issues)
    const basis = oneOf(row.basis, ['per_serving'] as const, `${path}.basis`, issues)
    const dose = doseField(row.dose, `${path}.dose`, substanceId)
    // Component/total links are preserved for a future duplicate-aware safety
    // engine. This intake never sums ingredient rows or infers constituents.
    const includes = read(row.includes, `${path}.includes`, value => list(value, `${path}.includes.value`, issues, true).map((entry, entryIndex) => text(entry, `${path}.includes.value.${entryIndex}`, issues, 200)))
    return { id, substanceId, form, standardisation, ratio, amountKind, basis, dose, includes }
  }).sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  for (const ingredient of ingredients) {
    const refs = ingredient.includes?.value ?? []
    if (new Set(refs).size !== refs.length || refs.some(id => id === ingredient.id || !ids.has(id))) issue(issues, `ingredients.${ingredient.id}.includes`, 'COMPONENT_LINK_INVALID')
  }
  const graph = new Map(ingredients.map(ingredient => [ingredient.id, ingredient.includes?.value ?? []]))
  const visited = new Set<string>(), visiting = new Set<string>()
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true
    if (visited.has(id)) return false
    visiting.add(id)
    if ((graph.get(id) ?? []).some(visit)) return true
    visiting.delete(id); visited.add(id); return false
  }
  if ([...graph.keys()].some(visit)) issue(issues, 'ingredients.includes', 'COMPONENT_CYCLE')
  const payload = { schemaVersion: 'formula-intake-v1', productId, variantId, formulaId, version, flavour,
    sources: sourceRecords, verification: { transcribedBy, reviewedBy, reviewedAt }, serving, dailyServings,
    dailyDirections, allergens, warnings, blendDisclosure, ingredients }
  return finish(issues, { ...payload, formulaHash: issues.length ? '' : sha(payload), verificationStatus: 'recorded_label_review' as const, publishable: false as const })
}

export function evidenceManifest(input: unknown, revision: unknown, now: number) {
  const issues: Issue[] = []
  timestamp(now, 'now', issues)
  const version = text(revision, 'evidenceRevision', issues, 200)
  const sourceRecords = sources(input, now, issues)
  if (sourceRecords.some(source => !['human_research', 'guidance'].includes(source.kind))) issue(issues, 'sources', 'RESEARCH_SOURCE_REQUIRED')
  return finish(issues, { revision: version, sources: sourceRecords, evidenceHash: issues.length ? '' : sha({ revision: version, sources: sourceRecords }) })
}

/** Validates an attributed review record, not the truth of its interpretation.
 * Inputs are revalidated and hashes checked against current snapshots on every call. */
export function validateAssessment(input: unknown, contextInput: unknown) {
  const context = record(contextInput) ? contextInput : {}
  const issues: Issue[] = [], raw = record(input) ? input : {}
  const now = timestamp(context.now, 'context.now', issues)
  const formula = validateFormula(context.formula, now)
  const manifest = evidenceManifest(context.evidenceSources, context.evidenceRevision, now)
  if (formula.status !== 'valid') issues.push(...formula.issues.map(entry => ({ ...entry, path: `formula.${entry.path}` })))
  if (manifest.status !== 'valid') issues.push(...manifest.issues)
  const modelVersion = text(context.modelVersion, 'context.modelVersion', issues, 200)
  const id = text(raw.id, 'assessment.id', issues, 200)
  for (const key of Object.keys(raw)) if (!['id', 'formulaHash', 'evidenceHash', 'modelVersion', 'outcome', 'category', 'confidence', 'formulaMatch', 'rationale', 'limitations', 'funding', 'reviewedBy', 'reviewedAt', 'expiresAt'].includes(key)) issue(issues, `assessment.${key}`, 'UNSUPPORTED_ASSESSMENT_FIELD')
  const formulaHash = text(raw.formulaHash, 'assessment.formulaHash', issues, 64)
  const evidenceHash = text(raw.evidenceHash, 'assessment.evidenceHash', issues, 64)
  const recordedModel = text(raw.modelVersion, 'assessment.modelVersion', issues, 200)
  if (formula.status === 'valid' && formulaHash !== formula.value.formulaHash) issue(issues, 'assessment.formulaHash', 'FORMULA_CHANGED')
  if (manifest.status === 'valid' && evidenceHash !== manifest.value.evidenceHash) issue(issues, 'assessment.evidenceHash', 'EVIDENCE_CHANGED')
  if (recordedModel !== modelVersion) issue(issues, 'assessment.modelVersion', 'MODEL_CHANGED')
  const outcomeRaw = record(raw.outcome) ? raw.outcome : {}
  const outcome = Object.fromEntries(['id', 'population', 'intervention', 'comparator', 'duration'].map(key => [key, text(outcomeRaw[key], `assessment.outcome.${key}`, issues)]))
  const category = oneOf(raw.category, ['established_in_context', 'promising_or_mixed', 'insufficient'] as const, 'assessment.category', issues)
  const confidence = oneOf(raw.confidence, ['high', 'moderate', 'low', 'very_low', 'not_assessed'] as const, 'assessment.confidence', issues)
  const formulaMatch = oneOf(raw.formulaMatch, ['matches', 'partly_matches', 'cannot_verify'] as const, 'assessment.formulaMatch', issues)
  const rationale = text(raw.rationale, 'assessment.rationale', issues)
  const limitations = list(raw.limitations, 'assessment.limitations', issues).map((item, index) => text(item, `assessment.limitations.${index}`, issues))
  const funding = text(raw.funding, 'assessment.funding', issues), reviewedBy = text(raw.reviewedBy, 'assessment.reviewedBy', issues, 200)
  const reviewedAt = timestamp(raw.reviewedAt, 'assessment.reviewedAt', issues), expiresAt = timestamp(raw.expiresAt, 'assessment.expiresAt', issues)
  if (reviewedAt > now || expiresAt <= now || expiresAt <= reviewedAt
    || (formula.status === 'valid' && formula.value.verification.reviewedAt > reviewedAt)
    || (manifest.status === 'valid' && manifest.value.sources.some(source => source.capturedAt > reviewedAt))) issue(issues, 'assessment.reviewedAt', 'REVIEW_TIME_INVALID')
  if (confidence === 'not_assessed' && category !== 'insufficient') issue(issues, 'assessment.confidence', 'UNASSESSED_CANNOT_ENDORSE')
  if (formulaMatch === 'matches' && formula.status === 'valid'
    && (formula.value.blendDisclosure?.value !== 'fully_disclosed' || formula.value.ingredients.some(row => row.amountKind === 'unspecified'))) issue(issues, 'assessment.formulaMatch', 'INCOMPLETE_FORMULA_CANNOT_MATCH')
  return finish(issues, { id, formulaHash, evidenceHash, modelVersion, outcome, category, confidence, formulaMatch,
    rationale, limitations, funding, reviewedBy, reviewedAt, expiresAt, publicationStatus: 'unpublished_review_record' as const, publishable: false as const })
}

/** Price remains a separate, time-bounded observation. No efficacy input/output. */
export function commercialValue(input: unknown, now: number) {
  const raw = record(input) ? input : {}, issues: Issue[] = []
  timestamp(now, 'now', issues)
  const variantId = text(raw.variantId, 'value.variantId', issues, 200), sourceId = text(raw.sourceId, 'value.sourceId', issues, 200)
  const currency = oneOf(raw.currency, ['GBP'] as const, 'value.currency', issues)
  const price = raw.priceMinor
  if (absent(price)) issue(issues, 'value.priceMinor', 'PRICE_REQUIRED', 'missing')
  else if (typeof price !== 'number' || !Number.isSafeInteger(price) || price <= 0) issue(issues, 'value.priceMinor', 'PRICE_INVALID')
  const servings = decimal(raw.verifiedServings, 'value.verifiedServings', issues)
  if (servings?.numerator === '0') issue(issues, 'value.verifiedServings', 'POSITIVE_SERVINGS_REQUIRED')
  const observedAt = timestamp(raw.observedAt, 'value.observedAt', issues), expiresAt = timestamp(raw.expiresAt, 'value.expiresAt', issues)
  if (observedAt > 0 && expiresAt > 0 && (observedAt > now || expiresAt <= now || expiresAt <= observedAt)) issue(issues, 'value.observedAt', 'VALUE_EXPIRED_OR_FUTURE')
  if (issues.length || !servings) return finish(issues, undefined as never)
  return finish(issues, { variantId, sourceId, currency, priceMinor: price as number, observedAt, expiresAt,
    perServingMinor: rational(BigInt(price as number) * BigInt(servings.denominator), BigInt(servings.numerator)),
    scope: 'listed_pack_price_only' as const, assessmentIndependent: true as const })
}

/** Quarantine the frozen table without aliases, grades or a formula association. */
export function adaptLegacyScores(input: unknown, snapshotInput: unknown) {
  const issues: Issue[] = []
  const snapshot = record(snapshotInput) ? snapshotInput : {}
  const version = text(snapshot.version, 'snapshot.version', issues, 200), sourcePath = text(snapshot.sourcePath, 'snapshot.sourcePath', issues)
  if (!record(input) || !Object.keys(input).length) issue(issues, 'scores', 'LEGACY_TABLE_REQUIRED', absent(input) || (record(input) && !Object.keys(input).length) ? 'missing' : 'invalid')
  const rows = record(input) ? Object.entries(input).map(([lookupKey, rawScore]) => {
    const valid = typeof rawScore === 'number' && Number.isInteger(rawScore) && rawScore >= 0 && rawScore <= 100
    return { lookupKey, historicalScore: valid ? { status: 'recorded' as const, value: rawScore }
      : { status: absent(rawScore) ? 'missing' as const : 'invalid' as const, reason: 'No valid legacy number; never coerce or default' },
    recordType: 'legacy_unverified' as const, confidence: 'not_assessed' as const, formulaId: null, assessment: null, publishable: false as const }
  }).sort((a, b) => a.lookupKey < b.lookupKey ? -1 : a.lookupKey > b.lookupKey ? 1 : 0) : []
  return finish(issues, { snapshot: { version, sourcePath, recordsHash: sha(rows) }, rows })
}
