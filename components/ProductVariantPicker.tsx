'use client'

import { useId } from 'react'
import type { StoreVariantOption } from '@/lib/commerce/product-mapping'
import { catalogueAvailabilityFor, type CataloguePresentation } from '@/lib/commerce/catalogue-presentation'

export default function ProductVariantPicker({ productId, variants, selected, onChange, cataloguePresentation }: {
  cataloguePresentation?: CataloguePresentation | null
  productId: string; variants: readonly StoreVariantOption[]; selected: StoreVariantOption; onChange: (id: string) => void
}) {
  const id = useId()
  const stock = catalogueAvailabilityFor({ id: productId, cataloguePresentation, storePrice: selected.storePrice })
  const status = stock === 'available' ? 'In stock at TLL Store' : stock === 'out_of_stock'
    ? 'Out of stock at TLL Store' : stock === 'unavailable' || selected.storePrice ? 'TLL Store price and stock unavailable' : 'Check price and stock at TLL Store'
  return <div className="space-y-2">
    {variants.length > 1 ? <><label htmlFor={id} className="block text-sm font-bold">Flavour / size</label>
    <select id={id} value={selected.variantId} onChange={event => onChange(event.target.value)}
      aria-describedby={`${id}-status`} className="min-h-11 w-full rounded-lg border border-lab-border bg-lab-panel px-3 text-white">
      {variants.map(variant => <option key={variant.variantId} value={variant.variantId}>{variant.label}</option>)}
    </select></> : <p className="text-sm">Flavour / size: {selected.label}</p>}
    <p id={`${id}-status`} role="status" aria-live="polite" className="text-xs text-lab-muted">
      {stock !== 'unavailable' && selected.storePrice?.price != null ? `£${selected.storePrice.price.toFixed(2)} · ` : ''}{status}
    </p>
  </div>
}
