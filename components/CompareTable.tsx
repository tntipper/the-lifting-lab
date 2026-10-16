'use client'

import { displayPrice } from '@/lib/commerce/display-price'
import type { ReactNode } from 'react'
import type { ScoredProduct } from '@/lib/products'
import ProductAssessment from './ProductAssessment'
import ProductOfferLink from './ProductOfferLink'
import { panelMoney } from './ShopPanelsContext'

export default function CompareTable({ products, onRemove }: { products: ScoredProduct[]; onRemove(id: string): void }) {
  const items = products.slice(0, 3)
  const nutrients = [...new Set(items.flatMap(product => (product.nutrients ?? []).map(n => n.nutrient_name)))]
  function row(label: string, values: ReactNode[], lowest = false) {
    const numbers = lowest ? values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0) : []
    const best = numbers.length >= 2 ? Math.min(...numbers) : null
    return <tr key={label}><th scope="row">{label}</th>{values.map((value, index) => <td key={items[index].id}>{lowest ? panelMoney(typeof value === 'number' ? value : null) : value ?? 'Not listed'}{best !== null && value === best && <span className="shop-best">Lowest</span>}</td>)}</tr>
  }
  return <div className="shop-table-scroll" role="region" aria-label="Product comparison table, scroll horizontally" tabIndex={0}><table className="shop-compare-table">
    <caption className="sr-only">Comparison of {items.length} products</caption>
    <thead><tr><th scope="col">Product</th>{items.map(product => <th scope="col" key={product.id}><div className="shop-column-heading"><span className="shop-eyebrow">{product.brand}</span><span>{product.name}</span><ProductAssessment product={product} /><ProductOfferLink product={product} className="shop-primary" /><button type="button" onClick={() => onRemove(product.id)} aria-label={`Remove ${product.name} from comparison`}>Remove</button></div></th>)}</tr></thead>
    <tbody>
      <tr className="shop-table-group"><th colSpan={items.length + 1}>Price</th></tr>
      {row('Recorded pack price', items.map(displayPrice), true)}
      {row('Servings', items.map(p => p.servings_per_container))}
      {row('Serving size', items.map(p => p.serving_size == null ? null : `${p.serving_size} ${p.serving_unit ?? ''}`))}
      {row('Listed price per serving', items.map(p => p.cost_per_serving), true)}
      {row('True cost per effective serving', items.map(() => 'Unavailable pending review'))}
      <tr className="shop-table-group"><th colSpan={items.length + 1}>Ingredients and nutrition per serving</th></tr>
      {nutrients.map(name => row(name, items.map(p => { const n = p.nutrients?.find(n => n.nutrient_name === name); return n ? `${n.amount} ${n.unit}` : null })))}
      {!nutrients.length && <tr><td colSpan={items.length + 1}>Per-serving label data is not listed for these products.</td></tr>}
    </tbody>
  </table></div>
}
