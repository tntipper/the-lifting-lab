// Applies scripts/tll-p0-2-catalogue-backfill-2026-08-22.sql (live UPDATEs only) to the read-only
// snapshot in memory and prints before/after missing-field counts. Touches no DB.
import { readFileSync } from 'node:fs'
const snap = JSON.parse(readFileSync('scripts/_audit-completeness.json','utf8'))
const rows = structuredClone(snap.products)
const byId = new Map(rows.map(p=>[p.id,p]))
const sql = readFileSync('scripts/tll-p0-2-catalogue-backfill-2026-08-22.sql','utf8')
const live = sql.split('\n').filter(l=>l.startsWith('UPDATE public.products SET '))
let n=0
for (const l of live) {
  const m = l.match(/^UPDATE public\.products SET (.+?) WHERE id = '([^']+)'/)
  const p = byId.get(m[2]); if(!p) throw new Error('unknown id '+m[2])
  for (const kv of m[1].split(/,\s*(?=[a-z_]+ =)/)) {
    const [k,v] = kv.split(' = ')
    p[k] = v.startsWith("'") ? v.slice(1,-1).replace(/''/g,"'") : Number(v)
  }
  n++
}
const count = (list) => ({
  image_url: list.filter(p=>!p.image_url).length,
  buy_url: list.filter(p=>!p.buy_url).length,
  servings_per_container: list.filter(p=>!p.servings_per_container).length,
  cost_per_serving: list.filter(p=>!(p.retail_price>0 && p.servings_per_container>0)).length,
  serving_size: list.filter(p=>!p.serving_size).length,
  nutrients: list.filter(p=>!p.nutrients.length).length,
})
console.log('UPDATEs applied:', n, 'of', snap.total, 'active products')
console.table({ before: count(snap.products), after: count(rows) })
