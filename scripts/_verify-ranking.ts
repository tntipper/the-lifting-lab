// TLL-P0-3 verification — runs the REAL ranking functions against (a) synthetic
// edge cases and (b) the read-only live snapshot in scripts/_audit-completeness.json.
// Usage: npx tsx scripts/_verify-ranking.ts   (exits non-zero on any failure)
import { readFileSync } from 'node:fs'
import { withScore, sortScored, hasVerifiedCost, type Product } from '../lib/products'
import { rankCheapest } from '../lib/cheapest'
import { deriveAwards } from '../lib/best-categories'
import { selectStack, STACK_GUIDES } from '../lib/stacks'
import { valueRatio } from '../lib/alternatives'
import { proteinValueRows } from '../lib/protein-value'

let failures = 0
function check(cond: boolean, msg: string) {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) failures++
}

const base = (over: Partial<Product>): Product => ({
  id: over.id ?? 'x',
  name: over.name ?? 'Creatine Monohydrate',
  brand: over.brand ?? 'Bulk',
  category: 'creatine',
  serving_size: 5,
  serving_unit: 'g',
  servings_per_container: 100,
  image_url: null,
  informed_sport: false,
  retail_price: 24.99,
  buy_url: null,
  proprietary_blend: false,
  amino_spiked: false,
  protein_yield: null,
  ...over,
})

// --- (a) synthetic -----------------------------------------------------------
// Real scored products (score comes from lib/scores via brand+name alias):
const real = base({ id: 'real', brand: 'Bulk', name: 'Creatine Monohydrate', retail_price: 24.99, servings_per_container: 100 })
const zeroPrice = base({ id: 'zero', brand: 'Bulk', name: 'Creatine Monohydrate', retail_price: 0, servings_per_container: 100 })
const noServings = base({ id: 'nosrv', brand: 'Bulk', name: 'Creatine Monohydrate', retail_price: 5, servings_per_container: null })
const zeroServings = base({ id: 'zerosrv', brand: 'Bulk', name: 'Creatine Monohydrate', retail_price: 5, servings_per_container: 0 })
const noPrice = base({ id: 'noprice', brand: 'Bulk', name: 'Creatine Monohydrate', retail_price: null })

const scored = [zeroPrice, noServings, zeroServings, noPrice, real].map(withScore)
console.log('synthetic scores:', scored.map((p) => `${p.id}:score=${p.score} cps=${p.cost_per_serving}`).join(' | '))
check(scored.find((p) => p.id === 'real')!.score != null, 'synthetic real product is scored (test is meaningful)')
check(scored.find((p) => p.id === 'zero')!.cost_per_serving === null, '£0 retail price -> cost_per_serving null (not 0)')
check(scored.find((p) => p.id === 'nosrv')!.cost_per_serving === null, 'missing servings -> cost_per_serving null')
check(scored.find((p) => p.id === 'zerosrv')!.cost_per_serving === null, 'zero servings -> cost_per_serving null')
check(scored.find((p) => p.id === 'noprice')!.cost_per_serving === null, 'missing price -> cost_per_serving null')

check(sortScored(scored, 'value')[0].id === 'real', "sortScored('value') puts the verified-cost product first")
check(sortScored(scored, 'budget')[0].id === 'real', "sortScored('budget') puts the verified-cost product first (not the £0 one)")
check(rankCheapest([zeroPrice, noServings, zeroServings, noPrice, real]).every((p) => p.id === 'real'), 'rankCheapest only returns verified-cost rows')
const awards = deriveAwards(sortScored(scored, 'score'))
check(awards.bestValue?.id === 'real' && awards.bestBudget?.id === 'real', 'deriveAwards bestValue/bestBudget never crown unverified-cost rows')
check(valueRatio(scored.find((p) => p.id === 'zero')!) === null, 'valueRatio(£0 product) is null')
const budgetStack = STACK_GUIDES.find((s) => s.pick === 'budget')
if (budgetStack) {
  const byCat = new Map([['creatine', scored]])
  const pick = selectStack(byCat, { ...budgetStack, categories: ['creatine'], maxProducts: 1 })
  check(pick[0]?.id === 'real', 'selectStack budget pick ignores unverified-cost rows')
}
// Awards with ONLY unverified rows -> no value/budget award at all
const onlyBad = deriveAwards(sortScored([zeroPrice, noServings].map(withScore), 'score'))
check(onlyBad.bestValue === null && onlyBad.bestBudget === null, 'deriveAwards yields no value/budget award when no verified cost exists')

// --- (b) live snapshot -------------------------------------------------------
const snap = JSON.parse(readFileSync('scripts/_audit-completeness.json', 'utf8'))
const live: Product[] = snap.products
const liveScored = live.map(withScore)
const unverified = liveScored.filter((p) => !hasVerifiedCost(p))
console.log(`live: ${live.length} active, ${unverified.length} without verified cost`)
check(liveScored.every((p) => p.cost_per_serving === null || p.cost_per_serving > 0), 'live: no product has cost_per_serving <= 0')
const cheap = rankCheapest(live)
check(cheap.every(hasVerifiedCost), `live: /cheapest ranking (${cheap.length} rows) contains only verified-cost rows`)
const byCat = new Map<string, typeof liveScored>()
for (const p of liveScored) byCat.set(p.category, [...(byCat.get(p.category) ?? []), p])
let awardFails = 0
for (const [, list] of byCat) {
  const a = deriveAwards(sortScored(list, 'score'))
  if (a.bestValue && !hasVerifiedCost(a.bestValue)) awardFails++
  if (a.bestBudget && !hasVerifiedCost(a.bestBudget)) awardFails++
}
check(awardFails === 0, `live: /best/[category] value+budget awards across ${byCat.size} categories all verified-cost`)
for (const [cat, list] of byCat) {
  const top = sortScored(list, 'value')[0]
  const topB = sortScored(list, 'budget')[0]
  const anyVerified = list.some(hasVerifiedCost)
  if (anyVerified && (!hasVerifiedCost(top) || !hasVerifiedCost(topB))) {
    check(false, `live: category ${cat} value/budget sort top row unverified despite verified rows existing`)
  }
}
const prot = proteinValueRows(live)
check(prot.every((r) => r.retail_price > 0 && r.costPerGram > 0), `live: /protein-value rows (${prot.length}) all positive`)

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED')
process.exit(failures ? 1 : 0)
