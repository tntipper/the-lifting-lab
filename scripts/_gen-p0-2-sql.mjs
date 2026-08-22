// Generates scripts/tll-p0-2-catalogue-backfill-2026-08-22.sql from SOURCED data only.
// Inputs (all already in repo):
//   scripts/_verify-consolidated.json   servings (each row carries 1-3 source URLs)
//   scripts/update-images.sql           Bulk image URLs (Awin feed / bulk.com; HTTP-200 checked 2026-08-22)
//   scripts/backfill-buy-urls-amazon-2026-08-03.sql  verified Amazon ASINs + Awin re-wraps
//   scripts/fix-broken-buy-urls-2026-08-14.sql       verified replacement product pages
//   scripts/_audit-completeness.json   read-only live snapshot (what is currently empty)
// Nothing here is invented: every UPDATE is copied from one of those sources and cited.
import { readFileSync, writeFileSync } from 'node:fs'

const snap = JSON.parse(readFileSync('scripts/_audit-completeness.json', 'utf8'))
const byId = new Map(snap.products.map((p) => [p.id, p]))
const verified = JSON.parse(readFileSync('scripts/_verify-consolidated.json', 'utf8'))

const q = (s) => `'${String(s).replace(/'/g, "''")}'`
const out = []
const L = (s = '') => out.push(s)

L('-- TLL-P0-2 — Catalogue completeness backfill (generated 2026-08-22 by scripts/_gen-p0-2-sql.mjs)')
L('-- Run in the Supabase SQL Editor. Plain UPDATEs by id — idempotent / safe to re-run.')
L('--')
L('-- RULE: every value below is copied from a cited source already in the repo. Nothing is')
L('-- estimated or inferred. Rows whose value depended on an inference (pack-size guess,')
L('-- product-identity mismatch, derived dosing maths) are NOT applied — they sit commented')
L('-- out in Section E for a human decision.')
L('--')
L('-- Sections:  A servings (high-confidence, cited)   B Bulk image_url (cited, HTTP 200)')
L('--            C buy_url gap-fills (cited)            D buy_url dead-link repairs (cited)')
L('--            E NOT applied — needs a decision')
L('')
L('BEGIN;')
L('')

// ---------- A: servings ----------
L('-- ============================================================')
L('-- A. servings_per_container / serving_size / serving_unit')
L('--    Source: scripts/_verify-consolidated.json (2026-06-29 verification pass; each row')
L('--    cross-checked against the listed retailer/brand pages; pack size matched to retail_price).')
L('--    Only final_confidence = high rows are applied here.')
L('-- ============================================================')
const applied = { servings: 0, serving_size: 0, serving_unit: 0 }
const deferred = []
for (const e of verified) {
  const p = byId.get(e.id)
  if (!p) continue // not an active product
  if (e.servings_per_container == null) continue // verification returned no result
  if (e.final_confidence !== 'high') {
    deferred.push(e)
    continue
  }
  if (p.servings_per_container != null && p.serving_size != null) continue // already filled
  const sets = []
  if (p.servings_per_container == null) {
    sets.push(`servings_per_container = ${e.servings_per_container}`)
    applied.servings++
  }
  if (p.serving_size == null && e.serving_size != null) {
    sets.push(`serving_size = ${e.serving_size}`)
    applied.serving_size++
  }
  if (e.serving_unit && e.serving_unit !== p.serving_unit) {
    sets.push(`serving_unit = ${q(e.serving_unit)}`)
    applied.serving_unit++
  }
  if (!sets.length) continue
  L(`-- ${p.brand} — ${p.name}  (retail_price £${p.retail_price})`)
  for (const s of e.sources || []) L(`--   source: ${s}`)
  L(`UPDATE public.products SET ${sets.join(', ')} WHERE id = ${q(e.id)};`)
  L('')
}

// ---------- B: images ----------
L('-- ============================================================')
L('-- B. image_url — Bulk products')
L('--    Source: scripts/update-images.sql (Awin product feed + bulk.com, 2026-06-13).')
L('--    Each URL re-fetched 2026-08-22: HTTP 200, image/* content-type.')
L('--    Keyed by id (resolved from the brand+name in the source file against the live snapshot).')
L('--    "High Protein Bar" deliberately omitted: the source file re-used the Macro Munch image for it.')
L('-- ============================================================')
const imgSql = readFileSync('scripts/update-images.sql', 'utf8')
const imgRe = /UPDATE public\.products SET image_url = '([^']+)'\s+WHERE brand = '([^']+)' AND name = '([^']+)';/g
let m
const images = []
const seenImg = new Set()
while ((m = imgRe.exec(imgSql))) {
  const [, url, brand, name] = m
  if (name === 'High Protein Bar') continue // wrong image in source (duplicate of Macro Munch)
  const matches = snap.products.filter((p) => p.brand === brand && p.name === name)
  if (matches.length !== 1) {
    L(`-- SKIPPED (${matches.length} active matches): ${brand} — ${name}`)
    continue
  }
  if (seenImg.has(url)) {
    L(`-- SKIPPED (duplicate image URL): ${brand} — ${name}`)
    continue
  }
  seenImg.add(url)
  const p = matches[0]
  if (p.image_url) continue
  images.push(p.id)
  L(`-- ${brand} — ${name}`)
  L(`UPDATE public.products SET image_url = ${q(url)} WHERE id = ${q(p.id)} AND image_url IS NULL;`)
  L('')
}

// ---------- C: buy_url gap-fills ----------
L('-- ============================================================')
L('-- C. buy_url — gap-fills and Awin re-wraps')
L('--    Source: scripts/backfill-buy-urls-amazon-2026-08-03.sql. Its header: every ASIN was found')
L('--    via search, then confirmed by loading amazon.co.uk/dp/<ASIN> and reading the live title,')
L('--    price and stock. Re-fetched 2026-08-22: HTTP 200. Affiliate tag theliftinglab-21 unchanged;')
L('--    Awin awinmid=4822 / awinaffid=2919631 unchanged.')
L('-- ============================================================')
const amz = readFileSync('scripts/backfill-buy-urls-amazon-2026-08-03.sql', 'utf8')
const amzRe = /--\s*([^\n]+)\n(?:--[^\n]*\n)*UPDATE products SET buy_url =\s*'([^']+)'\s*WHERE id = '([^']+)';/g
const buyFills = []
const buyRewraps = []
const DEFER_BUY = {
  '5e13c87a-1d35-4dd5-a141-43a281bef5e5': 'Amazon listing is a 16-stick pack; DB row says 15 servings — pack may not match the priced SKU',
  '943638a7-3c67-4c92-900c-ab0bfa9d7a60': 'Amazon price £8.00 vs retail_price £24.99 — source file itself flags possible clearance / different size',
}
const deferredBuy = []
while ((m = amzRe.exec(amz))) {
  const [, label, url, id] = m
  const p = byId.get(id)
  if (!p) continue
  if (DEFER_BUY[id]) {
    deferredBuy.push({ id, label, url, why: DEFER_BUY[id] })
    continue
  }
  if (p.buy_url === url) continue
  L(`-- ${label.trim()}  (current: ${p.buy_url ? p.buy_url : 'NULL'})`)
  L(`UPDATE public.products SET buy_url = ${q(url)} WHERE id = ${q(id)};`)
  L('')
  ;(p.buy_url ? buyRewraps : buyFills).push(id)
}

// ---------- D: dead-link repairs ----------
L('-- ============================================================')
L('-- D. buy_url — dead-link repairs')
L('--    Source: scripts/fix-broken-buy-urls-2026-08-14.sql (full outbound-link audit; each')
L('--    replacement fetched and confirmed HTTP 200 with the correct product <h1>).')
L('-- ============================================================')
const fix = readFileSync('scripts/fix-broken-buy-urls-2026-08-14.sql', 'utf8')
const fixRe = /UPDATE products\s+SET buy_url = '([^']+)'\s+WHERE id = '([^']+)'/g
const repairs = []
while ((m = fixRe.exec(fix))) {
  const [, url, id] = m
  const p = byId.get(id)
  if (!p || p.buy_url === url) continue
  L(`-- ${p.brand} — ${p.name}  (current: ${p.buy_url})`)
  L(`UPDATE public.products SET buy_url = ${q(url)} WHERE id = ${q(id)};`)
  L('')
  repairs.push(id)
}

L('COMMIT;')
L('')

// ---------- E: deferred ----------
L('-- ============================================================')
L('-- E. NOT APPLIED — needs a human decision (left commented out on purpose)')
L('-- ============================================================')
for (const e of deferred) {
  const p = byId.get(e.id)
  L(`-- [${e.final_confidence}] ${p.brand} — ${p.name}: spc=${e.servings_per_container}, ss=${e.serving_size} ${e.serving_unit}`)
  L(`--   why deferred: ${e.note}`)
  for (const s of e.sources || []) L(`--   source: ${s}`)
  L(`-- UPDATE public.products SET servings_per_container = ${e.servings_per_container}, serving_size = ${e.serving_size}, serving_unit = ${q(e.serving_unit)} WHERE id = ${q(e.id)};`)
  L('')
}
for (const d of deferredBuy) {
  L(`-- ${d.label.trim()}: ${d.why}`)
  L(`-- UPDATE public.products SET buy_url = ${q(d.url)} WHERE id = ${q(d.id)};`)
  L('')
}
L('-- Also deliberately NOT included (see PR description): Darkstims Ultra servings 2→20 (no source URL);')
L('-- replace-discontinued-products.sql images (coupled to product renames + price changes);')
L('-- backfill-servings-2026-08-17.sql (generated from _servings-research.json which has no sources and')
L("-- self-describes values as 'assumed'); fix-units-discontinued-2026-08-17.sql (delists 2 products —")
L('-- business decision); any nutrient rows (no sourced data exists for the 25 products missing them).')

writeFileSync('scripts/tll-p0-2-catalogue-backfill-2026-08-22.sql', out.join('\n') + '\n')
console.log(JSON.stringify({ applied, images: images.length, buyFills: buyFills.length, buyRewraps: buyRewraps.length, repairs: repairs.length, deferredServings: deferred.length, deferredBuy: deferredBuy.length }, null, 1))
