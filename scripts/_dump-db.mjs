// TEMP read-only DB dump for reconciliation. Does NOT write anything.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const envPath = resolve(ROOT, '.env.local')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_KEY
const sb = createClient(URL, KEY)

const { data: products, error } = await sb
  .from('products')
  .select('id, name, brand, category, status, serving_size, serving_unit, servings_per_container, image_url, informed_sport, retail_price, buy_url')
if (error) { console.error('ERR products', error.message); process.exit(1) }

const { data: nuts, error: nErr } = await sb
  .from('product_nutrients')
  .select('product_id, nutrient_name, amount, unit')
if (nErr) { console.error('ERR nutrients', nErr.message); process.exit(1) }

const byProd = {}
for (const n of nuts) (byProd[n.product_id] ||= []).push(n)

const out = products.map(p => ({ ...p, nutrients: byProd[p.id] || [] }))
import { writeFileSync } from 'node:fs'
writeFileSync(resolve(ROOT, 'scripts', '_db-dump.json'), JSON.stringify(out, null, 2))

// summary
const active = products.filter(p => p.status === 'active')
console.log('TOTAL products:', products.length, '| active:', active.length)
const statusCounts = {}
for (const p of products) statusCounts[p.status] = (statusCounts[p.status]||0)+1
console.log('status:', JSON.stringify(statusCounts))
console.log('active w/ retail_price:', active.filter(p=>p.retail_price!=null).length)
console.log('active w/ informed_sport=true:', active.filter(p=>p.informed_sport===true).length)
console.log('active w/ buy_url:', active.filter(p=>p.buy_url).length)
console.log('active w/ image_url:', active.filter(p=>p.image_url).length)
console.log('active w/ >=1 nutrient:', active.filter(p=>(byProd[p.id]||[]).length>0).length)
console.log('active w/ >=3 nutrients:', active.filter(p=>(byProd[p.id]||[]).length>=3).length)
const catCounts = {}
for (const p of active) catCounts[p.category] = (catCounts[p.category]||0)+1
console.log('active categories:', JSON.stringify(catCounts, null, 1))
