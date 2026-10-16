'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useLocalStack } from './LocalStackContext'
import { useCatalogueAssessments } from './useCatalogueAssessments'
import ProductAssessment from './ProductAssessment'
import { normaliseNutrientName } from '@/lib/nutrient-limits'
import { convertAmount } from '@/lib/stack-reference-ranges'
import { panelMoney } from './ShopPanelsContext'

type Detail = { id: string; retail_price: number | null; servings_per_container: number | null; product_nutrients: { nutrient_name: string; amount: number; unit: string }[] }

export default function StackSummary({ onClose }: { onClose(): void }) {
  const { stack, state, remove, clear, retry } = useLocalStack()
  const catalogue = useCatalogueAssessments(stack.map(item => item.id), true)
  const key = stack.map(item => item.id).sort().join(',')
  const [loaded, setLoaded] = useState<{ key: string; products: Detail[] } | null>(null)
  useEffect(() => {
    if (!key) return
    const controller = new AbortController()
    let active = true
    fetch(`/api/products/batch?ids=${encodeURIComponent(key)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : [])
      .then(products => { if (active) setLoaded({ key, products: Array.isArray(products) ? products : [] }) })
      .catch(() => { if (active) setLoaded({ key, products: [] }) })
    return () => { active = false; controller.abort() }
  }, [key])
  const details = loaded?.key === key ? loaded.products : []
  const servingsFor = (id: string) => {
    const saved = state.snapshot?.items.find(item => item.product_id === id)
    // Guest items mean one recorded serving; unresolved saved amounts stay unknown.
    return saved ? saved.servings_per_day : 1
  }
  const totals = new Map<string, { name: string; amount: number; unit: string; count: number }>()
  for (const product of details) {
    const servings = servingsFor(product.id)
    if (typeof servings !== 'number' || !Number.isFinite(servings) || servings <= 0) continue
    for (const nutrient of product.product_nutrients ?? []) {
      if (!Number.isFinite(nutrient.amount) || nutrient.amount < 0) continue
      const name = normaliseNutrientName(nutrient.nutrient_name)
      // Convert mass units before summing; incompatible units retain separate rows.
      const mass = convertAmount(nutrient.amount, nutrient.unit, 'mg')
      const unit = mass === null ? nutrient.unit : 'mg'
      const totalKey = `${name}|${unit}`
      const before = totals.get(totalKey)
      totals.set(totalKey, { name, unit, amount: (before?.amount ?? 0) + (mass ?? nutrient.amount) * servings, count: (before?.count ?? 0) + 1 })
    }
  }
  const costs = stack.map(item => {
    const detail = details.find(p => p.id === item.id), servings = servingsFor(item.id)
    // The old batch endpoint has catalogue prices only. Never present these as live store prices.
    if (process.env.NEXT_PUBLIC_TLL_STORE_PRICES === 'enabled' || !detail?.retail_price || !detail.servings_per_container || typeof servings !== 'number' || !Number.isFinite(servings) || servings <= 0) return null
    const cost = detail.retail_price / detail.servings_per_container * servings
    return Number.isFinite(cost) && cost > 0 ? cost : null
  })
  const cost = stack.length && costs.every((c): c is number => c !== null) ? costs.reduce((sum, c) => sum + c, 0) : null
  const busy = state.loading || state.busy
  function beforeRemove() { document.activeElement?.closest('dialog')?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus() }
  return <>
    <div className="shop-muted" role="status" aria-live="polite">
      {state.loading && <p>Loading your stack…</p>}{state.busy && <p>Saving stack…</p>}
      {state.error && <p>{state.error}</p>}
      {(state.retryable || state.identity && state.guest.length > 0) && <button type="button" disabled={busy} onClick={retry}>Retry stack sync</button>}
    </div>
    {stack.length === 0 ? <p>No supplements in your stack yet. Add products with Add to stack to see your combined dose and recorded cost per day.</p> : <section className="shop-summary" aria-label="Stack summary">
      <h3>Your stack, one dose</h3>
      <ul className="shop-stack-items">{stack.map((item, index) => {
        const trusted = catalogue.products.find(p => p.id === item.id), product = trusted ?? item
        return <li key={item.id}><div><p className="shop-eyebrow">{product.brand}</p><Link href={`/products/${item.id}`} onClick={onClose}>{product.name}</Link>{trusted ? <ProductAssessment product={trusted} size="sm" /> : <p className="shop-muted">{catalogue.loading ? 'Loading assessment…' : 'Assessment unavailable'}</p>}</div><div><span className="shop-mono">{panelMoney(costs[index])}</span><button type="button" aria-label={`Remove ${product.name} from My Stack`} disabled={busy} onClick={() => { beforeRemove(); remove(item.id) }}>Remove</button></div></li>
      })}</ul>
      <div className="shop-total"><span>Recorded cost per day</span><b className="shop-mono">{panelMoney(cost)}</b></div>
      <div className="shop-total"><span>Monthly cost (30 days)</span><b className="shop-mono">{panelMoney(cost === null ? null : cost * 30)}</b></div>
      <p className="shop-muted">Based on recorded prices and servings. These totals do not establish an effective dose. Missing prices or serving amounts keep totals unavailable.</p>
      <h4 className="shop-eyebrow">Full stack, per day</h4>
      {totals.size ? <dl className="shop-dose-list">{[...totals.entries()].map(([key, total]) => <div key={key}><dt>{total.name}{total.count > 1 && <small className="shop-muted">From {total.count} label entries</small>}</dt><dd className="shop-mono">{Math.round(total.amount * 100) / 100} {total.unit}</dd></div>)}</dl> : <p className="shop-muted">Ingredient totals are loading or unavailable.</p>}
      {(details.length !== stack.length || stack.some(p => servingsFor(p.id) == null)) && <p className="shop-muted">Some label data or daily serving amounts are unavailable; displayed ingredient totals are partial.</p>}
      <Link className="shop-primary" href="/stack" onClick={onClose}>View full stack and buying options</Link>
      <a className="shop-secondary" href={`mailto:?subject=${encodeURIComponent('My Lifting Lab stack')}&body=${encodeURIComponent(stack.map(p => `${p.brand} ${p.name}`).join('\n'))}`}>Email me this stack</a>
      <button type="button" disabled={busy} onClick={() => { beforeRemove(); clear() }}>Clear {state.identity ? 'saved stack' : 'stack'}</button>
    </section>}
  </>
}
