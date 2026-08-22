// READ-ONLY audit of active-product completeness (anon key, RLS-scoped). Writes nothing to the DB.
// Usage: node scripts/_audit-completeness.mjs  -> prints counts, writes scripts/_audit-completeness.json
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_KEY) // read-only SELECTs only

const { data, error } = await sb
  .from('products')
  .select(
    'id,name,brand,category,status,serving_size,serving_unit,servings_per_container,image_url,retail_price,buy_url,informed_sport,proprietary_blend,amino_spiked,protein_yield',
  )
  .eq('status', 'active')
if (error) { console.error(error); process.exit(1) }
const { data: nuts, error: e2 } = await sb.from('product_nutrients').select('product_id,nutrient_name,amount,unit')
if (e2) { console.error(e2); process.exit(1) }

const byProd = {}
for (const n of nuts) (byProd[n.product_id] ||= []).push(n)
const t = data.length
const miss = {
  image_url: data.filter((p) => !p.image_url),
  buy_url: data.filter((p) => !p.buy_url),
  retail_price: data.filter((p) => p.retail_price == null),
  servings_per_container: data.filter((p) => !p.servings_per_container),
  cost_per_serving: data.filter((p) => !(p.retail_price != null && p.servings_per_container > 0)),
  serving_size: data.filter((p) => !p.serving_size),
  nutrients: data.filter((p) => !(byProd[p.id] || []).length),
}
console.log('active products:', t)
for (const [k, v] of Object.entries(miss)) console.log(`${k.padEnd(24)} missing: ${String(v.length).padStart(4)} / ${t}`)
writeFileSync(
  'scripts/_audit-completeness.json',
  JSON.stringify(
    {
      total: t,
      missing: Object.fromEntries(
        Object.entries(miss).map(([k, v]) => [k, v.map((p) => ({ id: p.id, brand: p.brand, name: p.name, category: p.category, serving_unit: p.serving_unit }))]),
      ),
      products: data.map((p) => ({ ...p, nutrients: byProd[p.id] || [] })),
    },
    null,
    2,
  ),
)
