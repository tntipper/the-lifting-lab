import test from 'node:test'
import assert from 'node:assert/strict'
import { evaluateCatalogueEligibility } from '../lib/commerce/catalogue-eligibility.ts'

const NOW = 1800000000000
function review(version = 'v1') { return { approved: true, version, expectedVersion: version, verifiedAtMs: NOW - 1000, expiresAtMs: NOW + 10000 } }
function identity() { return { formulaId: 'formula-a', formulaVersion: 'formula-v2', flavourId: 'vanilla', labelVersion: 'label-v3', pack: {version:'pack-v4',sellingUnit:'single',innerCount:1,amountPerInner:500,unit:'g'} } }
function fixture() {
  const item = identity()
  return {
    evaluatedAtMs: NOW, requestedQuantity: 1,
    policy: { review: review('catalogue-policy-1'), ownShopOrigin:'https://shop.example.invalid', productPathPrefix:'/products/', maxStockAgeMs:60000, maxPriceAgeMs:300000, expectedPricingPolicyVersion:'pricing-policy-1' },
    product: { id:'product-a', status:'active', publication:'research_and_shop', identity:item },
    mapping: { review:review('mapping-1'), productId:'product-a',shopifyVariantId:'gid://shopify/ProductVariant/1001',supplierSku:'SYNTHETIC-SKU-A',status:'exact',source:'verified_labels',shopIdentity:structuredClone(item),supplierIdentity:structuredClone(item) },
    commerceLabel: { review:review('commerce-label-1'),formulaId:item.formulaId,formulaVersion:item.formulaVersion,labelVersion:item.labelVersion,packVersion:item.pack.version,source:'manufacturer_label',requiredSellingInformationComplete:true },
    cost: { review:review('cost-1'),shopifyVariantId:'1001',supplierSku:'SYNTHETIC-SKU-A',mappingVersion:'mapping-1',pricingPolicyVersion:'pricing-policy-1',currency:'GBP',allAttributableCostsKnown:true,taxTreatmentApproved:true,supplierDeliveryPencePerBillableItem:500,minimumListPricePence:2604 },
    price: { review:review('price-1'),shopifyVariantId:'1001',mappingVersion:'mapping-1',costVersion:'cost-1',currency:'GBP',amountPence:3000 },
    stock: { review:review('stock-1'),shopifyVariantId:'1001',supplierSku:'SYNTHETIC-SKU-A',packVersion:item.pack.version,basis:'reconciled_sellable_units',availableToSell:10 },
    operator: { review:review('clearance-1'),commerce:'clear',research:'clear' },
    destination: { kind:'own_shop_exact',url:'https://shop.example.invalid/products/product-a?variant=1001',productHandle:'product-a' },
    researchContextId:'healthy-adults-protein-intake',
    research: {review:review('assessment-1'),formulaId:item.formulaId,formulaVersion:item.formulaVersion,labelVersion:item.labelVersion,modelVersion:'model-2',expectedModelVersion:'model-2',evidenceVersion:'evidence-3',expectedEvidenceVersion:'evidence-3',contextId:'healthy-adults-protein-intake',source:'verified_label',independentReviewComplete:true,outcome:'endorsed'},
    servingBasis: {review:review('servings-1'),formulaId:item.formulaId,formulaVersion:item.formulaVersion,packVersion:item.pack.version,source:'verified_label',servingsPerSellableUnit:20},
  }
}
function held(decision, code) { assert.equal(decision.status,'hold'); assert.ok(decision.reasons.some(r => r.code===code),JSON.stringify(decision)) }

test('exact verified commerce and contextual evidence produce independent shared decisions', () => {
  const result=evaluateCatalogueEligibility(fixture())
  assert.equal(result.commerce.status,'eligible'); assert.equal(result.research.status,'eligible')
  assert.equal(result.servingValue.status,'eligible'); assert.equal(result.valueRankingEligible,true)
  assert.equal(result.evidenceRankingEligible,true); assert.equal(result.researchComparisonEligible,true)
  assert.deepEqual(result.display,{catalogueState:'research_listed',availability:'available',assessmentLabel:'Research reviewed'})
  assert.equal(result.purchaseTarget.shopifyVariantId,'gid://shopify/ProductVariant/1001')
  assert.equal(result.purchaseTarget.relationship,'own_shop'); assert.equal(result.linkState,'exact_own_shop')
  assert.equal(result.liveEnabled,false)
})

test('commercially approved product with unresolved research remains sellable and explicitly unassessed', () => {
  const value=fixture(); value.research=null
  const result=evaluateCatalogueEligibility(value)
  assert.equal(result.commerce.status,'eligible'); held(result.research,'MISSING_INPUT')
  assert.equal(result.research.assessmentState,'unassessed'); assert.equal(result.display.catalogueState,'unassessed')
  assert.equal(result.display.assessmentLabel,'Not assessed'); assert.equal(result.evidenceRankingEligible,false)
  assert.equal(result.valueRankingEligible,false); assert.ok(result.purchaseTarget)
})

test('shop-only intention stays explicit and never inherits scientific recommendations', () => {
  const value=fixture(); value.product.publication='shop_only'
  const result=evaluateCatalogueEligibility(value)
  assert.equal(result.commerce.status,'eligible'); held(result.research,'RESEARCH_NOT_REQUESTED')
  assert.equal(result.display.catalogueState,'shop_only'); assert.equal(result.research.assessmentState,'not_listed')
  assert.equal(result.valueRankingEligible,false)
})

test('negative independently reviewed outcome is assessed, displayable and not endorsed', () => {
  const value=fixture(); value.research.outcome='not_endorsed'
  const result=evaluateCatalogueEligibility(value)
  assert.equal(result.commerce.status,'eligible'); held(result.research,'NOT_ENDORSED')
  assert.equal(result.research.assessmentState,'assessed_not_endorsed'); assert.equal(result.display.assessmentLabel,'Not endorsed')
  assert.equal(result.display.catalogueState,'research_listed'); assert.equal(result.researchComparisonEligible,true)
  assert.equal(result.evidenceRankingEligible,false); assert.equal(result.valueRankingEligible,false)
})

test('commercial price and availability changes never alter scientific endorsement', () => {
  const baseline=evaluateCatalogueEligibility(fixture()).research
  for (const mutate of [v=>v.price.amountPence=1,v=>v.stock.availableToSell=0,v=>v.cost=null,v=>v.mapping=null,v=>v.commerceLabel=null]) {
    const value=fixture(); mutate(value)
    const result=evaluateCatalogueEligibility(value)
    assert.deepEqual(result.research,baseline); assert.equal(result.commerce.status,'hold')
    assert.equal(result.purchaseTarget,null); assert.equal(result.valueRankingEligible,false)
    assert.equal(result.evidenceRankingEligible,true)
  }
})

test('legacy score0,49,50,99,null and missing nutrient flags are not eligibility inputs', () => {
  const reference=evaluateCatalogueEligibility(fixture())
  for(const score of [0,49,50,99,null]){
    const value=fixture(); value.product.score=score; value.product.nutrients=[]
    assert.deepEqual(evaluateCatalogueEligibility(value),reference)
  }
  const value=fixture(); value.product.score=99; value.research.source='feed_estimate'; value.research.independentReviewComplete=false
  const result=evaluateCatalogueEligibility(value)
  assert.equal(result.commerce.status,'eligible'); held(result.research,'UNVERIFIED_SCIENCE')
  assert.equal(result.evidenceRankingEligible,false)
})

test('8×500ml remains volume and8×20tablets remains count; neither matches an inferred gram pack', () => {
  for(const [amountPerInner,unit] of [[500,'ml'],[20,'tablet']]){
    const value=fixture()
    for(const id of [value.product.identity,value.mapping.shopIdentity,value.mapping.supplierIdentity]) id.pack={version:'pack-v4',sellingUnit:'multipack',innerCount:8,amountPerInner,unit}
    assert.equal(evaluateCatalogueEligibility(value).commerce.status,'eligible')
    value.mapping.supplierIdentity.pack.unit='g'
    held(evaluateCatalogueEligibility(value).commerce,'IDENTITY_MISMATCH')
  }
})

test('equal total grams do not prove equal single/box identity', () => {
  const value=fixture()
  value.mapping.supplierIdentity.pack={version:'pack-v4',sellingUnit:'multipack',innerCount:10,amountPerInner:50,unit:'g'}
  held(evaluateCatalogueEligibility(value).commerce,'IDENTITY_MISMATCH')
})

test('serving estimates do not block safe selling but never create per-serving value or rankings', () => {
  const value=fixture(); value.servingBasis.source='feed_estimate'
  const result=evaluateCatalogueEligibility(value)
  assert.equal(result.commerce.status,'eligible'); assert.equal(result.research.status,'eligible')
  held(result.servingValue,'SERVING_BASIS_UNVERIFIED'); assert.equal(result.valueRankingEligible,false)
  value.servingBasis=null
  held(evaluateCatalogueEligibility(value).servingValue,'MISSING_INPUT')
})

test('search-only, absent and external destinations never create own-shop Buy targets', () => {
  for(const kind of ['search_only','none','external_exact']){
    const value=fixture(); value.destination={kind}
    const result=evaluateCatalogueEligibility(value)
    held(result.commerce,'NO_EXACT_DESTINATION'); assert.equal(result.purchaseTarget,null)
    assert.equal(result.linkState,kind==='search_only'?'search_only':'unavailable')
  }
  const value=fixture(); value.destination=null; value.product.brand='MyProtein'
  assert.equal(evaluateCatalogueEligibility(value).purchaseTarget,null)
})

test('headless product prefix can be explicitly configured without changing variant identity', () => {
  const value=fixture(); value.policy.productPathPrefix='/shop/products/'
  value.destination.url='https://shop.example.invalid/shop/products/product-a?variant=1001'
  assert.equal(evaluateCatalogueEligibility(value).commerce.status,'eligible')
})

for(const [label,mutate,code] of [
  ['missing policy',v=>v.policy=null,'MISSING_INPUT'],
  ['missing product',v=>v.product=null,'MISSING_INPUT'],
  ['draft product',v=>v.product.status='draft','PRODUCT_NOT_ACTIVE'],
  ['missing mapping',v=>v.mapping=null,'MISSING_INPUT'],
  ['ambiguous mapping',v=>v.mapping.status='ambiguous','MAPPING_NOT_EXACT'],
  ['name-only mapping',v=>v.mapping.source='name_match','ESTIMATED_IDENTITY'],
  ['estimate-only mapping',v=>v.mapping.source='feed_estimate','ESTIMATED_IDENTITY'],
  ['wrong comparison product',v=>v.mapping.productId='other','IDENTITY_MISMATCH'],
  ['wrong flavour',v=>v.mapping.shopIdentity.flavourId='chocolate','IDENTITY_MISMATCH'],
  ['changed formula',v=>v.mapping.supplierIdentity.formulaVersion='new','IDENTITY_MISMATCH'],
  ['wrong case quantity',v=>v.mapping.supplierIdentity.pack.innerCount=2,'IDENTITY_MISMATCH'],
  ['ambiguous scoop pack',v=>v.product.identity.pack.unit='scoop','INVALID_PACK_UNIT'],
  ['zero pack amount',v=>v.product.identity.pack.amountPerInner=0,'INVALID_INPUT'],
  ['fractional tablet count',v=>{v.product.identity.pack.unit='tablet';v.product.identity.pack.amountPerInner=0.5},'INVALID_INPUT'],
  ['missing label',v=>v.commerceLabel=null,'MISSING_INPUT'],
  ['incomplete selling label',v=>v.commerceLabel.requiredSellingInformationComplete=false,'COMMERCE_LABEL_INCOMPLETE'],
  ['estimated selling label',v=>v.commerceLabel.source='feed_estimate','COMMERCE_LABEL_INCOMPLETE'],
  ['missing cost',v=>v.cost=null,'UNKNOWN_COST'],
  ['unapproved tax',v=>v.cost.taxTreatmentApproved=false,'UNAPPROVED_TAX'],
  ['incomplete attributable cost',v=>v.cost.allAttributableCostsKnown=false,'UNKNOWN_COST'],
  ['delivery omitted',v=>v.cost.supplierDeliveryPencePerBillableItem=0,'DELIVERY_COST_MISSING'],
  ['underpriced pack',v=>v.price.amountPence=2603,'BELOW_PRICE_FLOOR'],
  ['zero price',v=>v.price.amountPence=0,'INVALID_INPUT'],
  ['negative price',v=>v.price.amountPence=-1,'INVALID_INPUT'],
  ['price NaN',v=>v.price.amountPence=NaN,'INVALID_INPUT'],
  ['price Infinity',v=>v.price.amountPence=Infinity,'INVALID_INPUT'],
  ['wrong price variant',v=>v.price.shopifyVariantId='1002','IDENTITY_MISMATCH'],
  ['wrong stock variant',v=>v.stock.shopifyVariantId='1002','IDENTITY_MISMATCH'],
  ['wrong supplier cost unit',v=>v.cost.supplierSku='OTHER','IDENTITY_MISMATCH'],
  ['changed cost version',v=>v.price.costVersion='old','IDENTITY_MISMATCH'],
  ['changed pricing policy',v=>v.cost.pricingPolicyVersion='old','IDENTITY_MISMATCH'],
  ['stale mapping version',v=>v.mapping.review.expectedVersion='new','STALE_VERSION'],
  ['expired cost',v=>v.cost.review.expiresAtMs=NOW,'EXPIRED'],
  ['future evidence',v=>v.stock.review.verifiedAtMs=NOW+1,'FUTURE_EVIDENCE'],
  ['stale stock age',v=>v.stock.review.verifiedAtMs=NOW-60000,'STALE_STOCK'],
  ['stale price age',v=>v.price.review.verifiedAtMs=NOW-300000,'STALE_PRICE'],
  ['raw supplier stock',v=>v.stock.basis='supplier_raw','UNRECONCILED_STOCK'],
  ['out of stock',v=>v.stock.availableToSell=0,'OUT_OF_STOCK'],
  ['insufficient requested stock',v=>v.requestedQuantity=11,'INSUFFICIENT_STOCK'],
  ['invalid requested quantity',v=>v.requestedQuantity=0,'INVALID_INPUT'],
  ['missing operator clearance',v=>v.operator=null,'OPERATOR_CLEARANCE_UNKNOWN'],
  ['operator commerce hold',v=>v.operator.commerce='hold','OPERATOR_HOLD'],
  ['expired clearance',v=>v.operator.review.expiresAtMs=NOW,'EXPIRED'],
  ['missing explicit variant',v=>v.destination.url='https://shop.example.invalid/products/product-a','DESTINATION_MISMATCH'],
  ['wrong destination variant',v=>v.destination.url='https://shop.example.invalid/products/product-a?variant=1002','DESTINATION_MISMATCH'],
  ['duplicate variant query',v=>v.destination.url+='&variant=1001','DESTINATION_MISMATCH'],
  ['retailer referral on owned URL',v=>v.destination.url+='&applyCode=FAKE','UNSUPPORTED_TRACKING'],
  ['affiliate tag on owned URL',v=>v.destination.url+='&tag=FAKE','UNSUPPORTED_TRACKING'],
  ['unexpected shop origin',v=>v.destination.url='https://other.example.invalid/products/product-a?variant=1001','DESTINATION_MISMATCH'],
  ['unsafe URL scheme',v=>v.destination.url='javascript:alert(1)','DESTINATION_MISMATCH'],
  ['wrong destination product',v=>v.destination.productHandle='other','DESTINATION_MISMATCH'],
]) test(`commerce HOLD: ${label}`,()=>{
  const value=fixture();mutate(value);const result=evaluateCatalogueEligibility(value)
  held(result.commerce,code);assert.equal(result.purchaseTarget,null);assert.equal(result.valueRankingEligible,false)
})

for(const [label,mutate,code] of [
  ['missing evidence',v=>v.research=null,'MISSING_INPUT'],
  ['unapproved evidence',v=>v.research.review.approved=false,'UNAPPROVED'],
  ['expired evidence',v=>v.research.review.expiresAtMs=NOW,'EXPIRED'],
  ['old formula',v=>v.research.formulaVersion='old','IDENTITY_MISMATCH'],
  ['changed label',v=>v.research.labelVersion='old','IDENTITY_MISMATCH'],
  ['changed model',v=>v.research.expectedModelVersion='new','IDENTITY_MISMATCH'],
  ['changed evidence',v=>v.research.expectedEvidenceVersion='new','IDENTITY_MISMATCH'],
  ['brand alias inheritance',v=>v.research.source='brand_alias','UNVERIFIED_SCIENCE'],
  ['feed score estimate',v=>v.research.source='feed_estimate','UNVERIFIED_SCIENCE'],
  ['unreviewed science',v=>v.research.independentReviewComplete=false,'UNVERIFIED_SCIENCE'],
  ['unknown science outcome',v=>v.research.outcome='unknown','UNVERIFIED_SCIENCE'],
  ['wrong outcome/population context',v=>v.researchContextId='children-other-outcome','RESEARCH_CONTEXT_MISMATCH'],
  ['research hold',v=>v.operator.research='hold','OPERATOR_HOLD'],
]) test(`research HOLD without suppressing verified commerce: ${label}`,()=>{
  const value=fixture();mutate(value);const result=evaluateCatalogueEligibility(value)
  held(result.research,code);assert.equal(result.commerce.status,'eligible');assert.equal(result.valueRankingEligible,false)
})

test('a hold does not silently expire into clearance',()=>{
  const value=fixture();value.operator.commerce='hold';value.operator.review.expiresAtMs=NOW-1
  const result=evaluateCatalogueEligibility(value)
  held(result.commerce,'OPERATOR_HOLD');held(result.commerce,'EXPIRED')
})

test('fully absent input returns HOLD for every decision without throwing',()=>{
  const result=evaluateCatalogueEligibility(undefined)
  assert.equal(result.commerce.status,'hold');assert.equal(result.research.status,'hold');assert.equal(result.servingValue.status,'hold')
  assert.equal(result.purchaseTarget,null);assert.equal(result.evaluatedAtMs,null)
})

test('evaluation is deterministic, serializable, immutable and time-explicit',()=>{
  const value=fixture(), copy=structuredClone(value), result=evaluateCatalogueEligibility(value)
  assert.deepEqual(value,copy);assert.deepEqual(result,evaluateCatalogueEligibility(value));assert.doesNotThrow(()=>JSON.stringify(result))
  value.evaluatedAtMs=NOW+10000
  held(evaluateCatalogueEligibility(value).commerce,'EXPIRED')
})

test('supplier tax markers and truthy strings cannot substitute for approved tax treatment',()=>{
  for(const marker of ['VAT','Zero','true']){
    const value=fixture();value.cost.taxTreatmentApproved=marker
    held(evaluateCatalogueEligibility(value).commerce,'UNAPPROVED_TAX')
  }
})

test('expiry and stale-age boundaries are exclusive and quantity projection uses sellable units',()=>{
  const value=fixture();value.stock.review.verifiedAtMs=NOW-59999;value.requestedQuantity=10
  assert.equal(evaluateCatalogueEligibility(value).commerce.status,'eligible')
  value.evaluatedAtMs=NOW+1
  held(evaluateCatalogueEligibility(value).commerce,'STALE_STOCK')
  value.evaluatedAtMs=NOW;value.stock.review.expiresAtMs=NOW
  held(evaluateCatalogueEligibility(value).commerce,'EXPIRED')
})
