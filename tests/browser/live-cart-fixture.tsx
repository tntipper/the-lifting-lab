import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProductOfferLink from '../../components/ProductOfferLink'
import ProductVariantPicker from '../../components/ProductVariantPicker'
import ProductGrid from '../../app/products/ProductGrid'
import TopNav from '../../components/TopNav'
import { LiveBasketContents } from '../../components/LiveBasket'
import BuyMyStack from '../../components/BuyMyStack'
import type { ScoredProduct } from '../../lib/products'

const now = Date.now()
function product(id: string, variant = id, inStock = true) {
  return { id, brand: 'Fixture', name: `Fixture item ${id}`, buy_url: null, category: 'creatine', score: 70,
    retail_price: 999, serving_size: 5, serving_unit: 'g', servings_per_container: 60, cost_per_serving: 0.2,
    product_nutrients: [], image_url: null, informed_sport: false,
    storeLinkMapping: { productId: id, shopifyProductHandle: 'fixture', shopifyVariantId: variant, active: true as const, approved: true as const,
      review: { approved: true, version: 'v1', expectedVersion: 'v1', verifiedAtMs: now - 1000, expiresAtMs: now + 600000 } },
    storePrice: { productId: id, price: 12, availableForSale: inStock, observedAtMs: now - 1000 } }
}
const choices = [product('family', '1001'), product('family', '1002'), product('family', '1003', false)].map((p, i) => ({
  variantId: p.storeLinkMapping.shopifyVariantId, mapping: p.storeLinkMapping, storePrice: p.storePrice,
  handle: 'fixture', label: ['Vanilla · 300 g', 'Chocolate · 300 g', 'Strawberry · 300 g'][i], flavour: null, packLabel: '300 g',
}))
function Fixture() {
  const [selectedId, setSelectedId] = useState('1001')
  const selected = choices.find(choice => choice.variantId === selectedId)!
  return <><TopNav signedInInitial={false} /><main className="mx-auto max-w-[1200px] p-4">
    {window.location.pathname === '/cart' ? <LiveBasketContents /> : <>
      <section aria-label="Selected product" className="max-w-sm">
        <ProductVariantPicker productId="family" variants={choices} selected={selected} onChange={setSelectedId} />
        <ProductOfferLink product={{ ...product('family'), storeLinkMapping: selected.mapping, storePrice: selected.storePrice }} variantLabel={selected.label} storeCampaign="compare" className="rounded-lg bg-black py-3 text-sm text-white" pickerOwnsStatus chooseAnother />
      </section>
      <section aria-label="Unmapped"><ProductOfferLink product={{ id: 'unmapped', name: 'Unmapped', brand: 'Fixture', buy_url: null }} /></section>
      <section aria-label="Stack checkout"><BuyMyStack items={[{ ...product('stack', '2001'), quantity: 2 }]} ready /></section>
      <ProductGrid initialProducts={[product('1', '3001'), product('2', '3002'), product('3', '3003', false)] as unknown as ScoredProduct[]} />
    </>}
  </main></>
}
createRoot(document.getElementById('fixture')!).render(<StrictMode><Fixture /></StrictMode>)
