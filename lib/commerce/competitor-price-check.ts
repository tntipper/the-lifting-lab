/** Offline evidence comparison. It never fetches, writes, recommends, or authorizes prices.
 * Observation holds exclude only their offer. Duplicate IDs and conflicting reviewed
 * identities additionally hold affected variants because their source is untrustworthy. */
export const COMPETITOR_PRICE_WRITES_ENABLED = false
export const MAX_COMPETITOR_PENCE = 1_000_000_000
export type CompetitorAvailability = 'in_stock' | 'sold_out' | 'unknown'
export type ShippingScenario = { id: string }
export type CompetitorVariant = { id: string; currency: 'GBP'; packIdentityVersion: string; own: { itemPricePence: number; customerShippingPence: number; shippingScenarioId: string }; floor: { itemPricePence: number; sourceVersion: string; dependencyVersion: string } }
export type CompetitorOffer = { id: string; retailerId: string; currency: 'GBP'; observedAtMs: number; availability: CompetitorAvailability; itemPricePence: number; customerShippingPence: number; shippingScenarioId: string; match: { variantId: string; packIdentityVersion: string; reviewed: boolean; exactVariantAndPack: boolean; evidenceId: string; reviewedAtMs: number; expiresAtMs: number } }
export type CompetitorPriceCheckInput = { snapshot: { id: string; observedAtMs: number }; evaluatedAtMs: number; freshness: { maxObservationAgeMs: number }; shippingScenario: ShippingScenario; variants: CompetitorVariant[]; offers: CompetitorOffer[] }
export type CompetitorPriceHoldCode = 'INVALID_INPUT' | 'SHARED_CONTEXT_INVALID' | 'NO_COMPARABLE_OFFER' | 'DUPLICATE_VARIANT_ID' | 'DUPLICATE_OFFER_ID' | 'CONFLICTING_OFFER_IDENTITY' | 'UNMATCHED_OFFER' | 'INVALID_MATCH' | 'MISSING_MATCH_EVIDENCE' | 'PACK_IDENTITY_MISMATCH' | 'SHIPPING_SCENARIO_MISMATCH' | 'STALE_SNAPSHOT' | 'FUTURE_SNAPSHOT' | 'STALE_OFFER' | 'FUTURE_OFFER' | 'FUTURE_REVIEW' | 'EXPIRED_REVIEW' | 'AVAILABILITY_UNKNOWN' | 'SOLD_OUT' | 'INVALID_CURRENCY' | 'INVALID_PENCE' | 'INVALID_TIMESTAMP' | 'INVALID_FLOOR'
export type CompetitorPriceHold = { code: CompetitorPriceHoldCode; field: string }
export type HeldCompetitorOffer = { id: string | null; inputIndex: number; holds: CompetitorPriceHold[] }
export type ComparableCompetitorOffer = { id: string; retailerId: string; deliveredPence: number; itemPricePence: number; customerShippingPence: number; evidenceId: string }
export type VariantCompetitorComparison = { id: string | null; inputIndex: number; ownDeliveredPence: number | null; floorDeliveredPence: number | null; floorSourceVersion: string | null; floorDependencyVersion: string | null; comparableOffers: ComparableCompetitorOffer[]; lowestComparableOffer: ComparableCompetitorOffer | null; deliveredGapPence: number | null; position: 'OWN_CHEAPER' | 'PARITY' | 'COMPETITOR_CHEAPER' | 'HOLD'; floorCanMeetLowestComparable: boolean | null; holds: CompetitorPriceHold[] }
export type CompetitorPriceCheckResult = { writesEnabled: false; automationEnabled: false; priceChangeAuthorized: false; snapshotId: string | null; evaluatedAtMs: number | null; variants: VariantCompetitorComparison[]; heldOffers: HeldCompetitorOffer[]; holds: CompetitorPriceHold[] }
const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && !!v.trim()
const money = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= MAX_COMPETITOR_PENCE
const timestamp = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER
const h = (code: CompetitorPriceHoldCode, field: string): CompetitorPriceHold => ({ code, field })
const sum = (a: number, b: number): number | null => a > MAX_COMPETITOR_PENCE - b ? null : a + b
const output = (value: Omit<CompetitorPriceCheckResult, 'writesEnabled' | 'automationEnabled' | 'priceChangeAuthorized'>): CompetitorPriceCheckResult => ({ writesEnabled: false, automationEnabled: false, priceChangeAuthorized: false, ...value })

/** Preserves enumerable malformed rows even when the shared envelope is malformed. */
export function evaluateCompetitorPriceCheck(input: unknown): CompetitorPriceCheckResult {
  const source = isRecord(input) ? input : {}, rows = Array.isArray(source.variants) ? source.variants : [], offerRows = Array.isArray(source.offers) ? source.offers : []
  const snapshot = isRecord(source.snapshot) ? source.snapshot : null, freshness = isRecord(source.freshness) ? source.freshness : null, scenario = isRecord(source.shippingScenario) ? source.shippingScenario : null
  const base: CompetitorPriceHold[] = []
  if (!isRecord(input)) base.push(h('INVALID_INPUT', 'input'))
  if (!snapshot) base.push(h('INVALID_INPUT', 'snapshot'))
  if (!freshness) base.push(h('INVALID_INPUT', 'freshness'))
  if (!scenario) base.push(h('INVALID_INPUT', 'shippingScenario'))
  if (!Array.isArray(source.variants)) base.push(h('INVALID_INPUT', 'variants'))
  if (!Array.isArray(source.offers)) base.push(h('INVALID_INPUT', 'offers'))
  const now = timestamp(source.evaluatedAtMs) ? source.evaluatedAtMs : null, maxAge = freshness && money(freshness.maxObservationAgeMs) && freshness.maxObservationAgeMs > 0 ? freshness.maxObservationAgeMs : null, scenarioId = scenario && text(scenario.id) ? scenario.id : null
  if (now === null) base.push(h('INVALID_TIMESTAMP', 'evaluatedAtMs'))
  if (maxAge === null) base.push(h('INVALID_INPUT', 'freshness.maxObservationAgeMs'))
  if (scenarioId === null) base.push(h('INVALID_INPUT', 'shippingScenario.id'))
  if (!snapshot || !text(snapshot.id)) base.push(h('INVALID_INPUT', 'snapshot.id'))
  if (!snapshot || !timestamp(snapshot.observedAtMs) || now === null || maxAge === null) base.push(h('INVALID_TIMESTAMP', 'snapshot.observedAtMs'))
  else if (snapshot.observedAtMs > now) base.push(h('FUTURE_SNAPSHOT', 'snapshot.observedAtMs'))
  else if (now - snapshot.observedAtMs >= maxAge) base.push(h('STALE_SNAPSHOT', 'snapshot.observedAtMs'))
  const counts = new Map<string, number>(), offerCounts = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) { const row = rows[i]; if (isRecord(row) && text(row.id)) counts.set(row.id, (counts.get(row.id) ?? 0) + 1) }
  for (let i = 0; i < offerRows.length; i++) { const row = offerRows[i]; if (isRecord(row) && text(row.id)) offerCounts.set(row.id, (offerCounts.get(row.id) ?? 0) + 1) }
  const variants: VariantCompetitorComparison[] = []
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], holds = [...base]
    if (!isRecord(row)) { variants.push({ id: null, inputIndex: i, ownDeliveredPence: null, floorDeliveredPence: null, floorSourceVersion: null, floorDependencyVersion: null, comparableOffers: [], lowestComparableOffer: null, deliveredGapPence: null, position: 'HOLD', floorCanMeetLowestComparable: null, holds: [...holds, h('INVALID_INPUT', `variants[${i}]`)] }); continue }
    const id = text(row.id) ? row.id : null, own = isRecord(row.own) ? row.own : null, floor = isRecord(row.floor) ? row.floor : null
    if (!id) holds.push(h('INVALID_INPUT', `variants[${i}].id`))
    if (id && (counts.get(id) ?? 0) > 1) holds.push(h('DUPLICATE_VARIANT_ID', `variants.${id}`))
    if (row.currency !== 'GBP') holds.push(h('INVALID_CURRENCY', `variants.${id ?? i}.currency`))
    if (!text(row.packIdentityVersion)) holds.push(h('INVALID_MATCH', `variants.${id ?? i}.packIdentityVersion`))
    let ownDeliveredPence: number | null = null, floorDeliveredPence: number | null = null
    if (!own || !money(own.itemPricePence) || !money(own.customerShippingPence) || own.shippingScenarioId !== scenarioId) holds.push(h('INVALID_INPUT', `variants.${id ?? i}.own`))
    else { ownDeliveredPence = sum(own.itemPricePence, own.customerShippingPence); if (ownDeliveredPence === null) holds.push(h('INVALID_PENCE', `variants.${id ?? i}.own`)) }
    if (!floor || !money(floor.itemPricePence) || !text(floor.sourceVersion) || !text(floor.dependencyVersion)) holds.push(h('INVALID_FLOOR', `variants.${id ?? i}.floor`))
    else if (own && money(own.customerShippingPence)) { floorDeliveredPence = sum(floor.itemPricePence, own.customerShippingPence); if (floorDeliveredPence === null) holds.push(h('INVALID_PENCE', `variants.${id ?? i}.floor`)) }
    variants.push({ id, inputIndex: i, ownDeliveredPence, floorDeliveredPence, floorSourceVersion: floor && text(floor.sourceVersion) ? floor.sourceVersion : null, floorDependencyVersion: floor && text(floor.dependencyVersion) ? floor.dependencyVersion : null, comparableOffers: [], lowestComparableOffer: null, deliveredGapPence: null, position: 'HOLD', floorCanMeetLowestComparable: null, holds })
  }
  const byId = new Map<string, VariantCompetitorComparison>(); for (const v of variants) if (v.id && counts.get(v.id) === 1) byId.set(v.id, v)
  const accepted = new Map<string, ComparableCompetitorOffer[]>(), heldOffers: HeldCompetitorOffer[] = [], blockers = new Map<string, CompetitorPriceHold[]>()
  const sharedContextInvalid = base.length > 0
  const block = (id: string | null, value: CompetitorPriceHold): void => { if (id) { const values = blockers.get(id) ?? []; values.push(value); blockers.set(id, values) } }
  for (let i = 0; i < offerRows.length; i++) {
    const row = offerRows[i]
    if (!isRecord(row)) { heldOffers.push({ id: null, inputIndex: i, holds: [h('INVALID_INPUT', `offers[${i}]`)] }); continue }
    const id = text(row.id) ? row.id : null, match = isRecord(row.match) ? row.match : null, variantId = match && text(match.variantId) ? match.variantId : null, target = variantId ? byId.get(variantId) : undefined, holds: CompetitorPriceHold[] = []
    if (sharedContextInvalid) holds.push(h('SHARED_CONTEXT_INVALID', 'shared'))
    if (!id) holds.push(h('INVALID_INPUT', `offers[${i}].id`))
    if (id && (offerCounts.get(id) ?? 0) > 1) { const value = h('DUPLICATE_OFFER_ID', `offers.${id}`); holds.push(value); block(variantId, value) }
    if (!text(row.retailerId)) holds.push(h('INVALID_INPUT', `offers.${id ?? i}.retailerId`))
    if (row.currency !== 'GBP') holds.push(h('INVALID_CURRENCY', `offers.${id ?? i}.currency`))
    if (!money(row.itemPricePence) || !money(row.customerShippingPence) || sum(row.itemPricePence, row.customerShippingPence) === null) holds.push(h('INVALID_PENCE', `offers.${id ?? i}`))
    if (row.shippingScenarioId !== scenarioId) holds.push(h('SHIPPING_SCENARIO_MISMATCH', `offers.${id ?? i}.shippingScenarioId`))
    if (!timestamp(row.observedAtMs) || now === null || maxAge === null) holds.push(h('INVALID_TIMESTAMP', `offers.${id ?? i}.observedAtMs`))
    else if (row.observedAtMs > now) holds.push(h('FUTURE_OFFER', `offers.${id ?? i}.observedAtMs`))
    else if (now - row.observedAtMs >= maxAge) holds.push(h('STALE_OFFER', `offers.${id ?? i}.observedAtMs`))
    if (row.availability === 'unknown') holds.push(h('AVAILABILITY_UNKNOWN', `offers.${id ?? i}.availability`)); else if (row.availability === 'sold_out') holds.push(h('SOLD_OUT', `offers.${id ?? i}.availability`)); else if (row.availability !== 'in_stock') holds.push(h('INVALID_INPUT', `offers.${id ?? i}.availability`))
    if (!match || !variantId || match.reviewed !== true || match.exactVariantAndPack !== true) holds.push(h('INVALID_MATCH', `offers.${id ?? i}.match`))
    if (!match || !text(match.evidenceId)) holds.push(h('MISSING_MATCH_EVIDENCE', `offers.${id ?? i}.match.evidenceId`))
    if (!match || !timestamp(match.reviewedAtMs) || !timestamp(match.expiresAtMs) || match.expiresAtMs <= match.reviewedAtMs || now === null) holds.push(h('INVALID_TIMESTAMP', `offers.${id ?? i}.match.review`))
    else if (match.reviewedAtMs > now) holds.push(h('FUTURE_REVIEW', `offers.${id ?? i}.match.reviewedAtMs`)); else if (now >= match.expiresAtMs) holds.push(h('EXPIRED_REVIEW', `offers.${id ?? i}.match.expiresAtMs`))
    if (!target) holds.push(h('UNMATCHED_OFFER', `offers.${id ?? i}.match.variantId`))
    else if (!text(match?.packIdentityVersion) || match.packIdentityVersion !== (rows[target.inputIndex] as Record<string, unknown>).packIdentityVersion) holds.push(h('PACK_IDENTITY_MISMATCH', `offers.${id ?? i}.match.packIdentityVersion`))
    if (holds.length) { heldOffers.push({ id, inputIndex: i, holds }); continue }
    const value: ComparableCompetitorOffer = { id: id!, retailerId: row.retailerId as string, deliveredPence: sum(row.itemPricePence as number, row.customerShippingPence as number)!, itemPricePence: row.itemPricePence as number, customerShippingPence: row.customerShippingPence as number, evidenceId: match!.evidenceId as string }
    const values = accepted.get(variantId!) ?? []; values.push(value); accepted.set(variantId!, values)
  }
  const identities = new Map<string, Map<string, Set<string>>>()
  for (let i = 0; i < offerRows.length; i++) { const row = offerRows[i], match = isRecord(row) && isRecord(row.match) ? row.match : null; if (!isRecord(row) || !text(row.id) || !match || !text(match.variantId) || !text(match.packIdentityVersion)) continue; const byVariant = identities.get(row.id) ?? new Map<string, Set<string>>(), packs = byVariant.get(match.variantId) ?? new Set<string>(); packs.add(match.packIdentityVersion); byVariant.set(match.variantId, packs); identities.set(row.id, byVariant) }
  for (const [id, byVariant] of identities) { let bindings = 0; for (const packs of byVariant.values()) bindings += packs.size; if (bindings > 1) for (const variantId of byVariant.keys()) block(variantId, h('CONFLICTING_OFFER_IDENTITY', `offers.${id}.match`)) }
  for (const v of variants) { if (v.id) v.holds.push(...(blockers.get(v.id) ?? [])); const values = v.id ? accepted.get(v.id) ?? [] : []; v.comparableOffers = values; if (!values.length) v.holds.push(h('NO_COMPARABLE_OFFER', `variants.${v.id ?? v.inputIndex}`)); if (!v.id || v.holds.length) continue; const lowest = values.reduce((a, b) => b.deliveredPence < a.deliveredPence ? b : a); v.lowestComparableOffer = lowest; v.deliveredGapPence = v.ownDeliveredPence! - lowest.deliveredPence; v.position = v.deliveredGapPence < 0 ? 'OWN_CHEAPER' : v.deliveredGapPence > 0 ? 'COMPETITOR_CHEAPER' : 'PARITY'; v.floorCanMeetLowestComparable = v.floorDeliveredPence! <= lowest.deliveredPence }
  return output({ snapshotId: snapshot && text(snapshot.id) ? snapshot.id : null, evaluatedAtMs: now, variants, heldOffers, holds: base })
}
