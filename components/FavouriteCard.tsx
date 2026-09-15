'use client'

import ProductAssessment from '@/components/ProductAssessment'
import FavouriteButton from '@/components/FavouriteButton'
import { categoryLabel } from '@/lib/categories'
import ProductOfferLink from '@/components/ProductOfferLink'
import type { ScoredProduct } from '@/lib/products'

// Shared favourited-product card. Used on the /favourites page and the
// dashboard so both surfaces render saved products with identical structure
// (score, brand/name, category, heart, retailer reference). ProductAssessment shows
// the legacy formula value or its review status — customer reviews remain separate.
export default function FavouriteCard({
  product: p,
  onRemove,
}: {
  product: ScoredProduct
  onRemove?: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4">
      <ProductAssessment product={p} />
      <div className="min-w-0 flex-1">
        <p className="text-white text-sm font-bold truncate">{p.brand}</p>
        <p className="text-lab-muted text-xs truncate">{p.name}</p>
        <span className="inline-block mt-1.5 text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
          {categoryLabel(p.category)}
        </span>
      </div>
      <FavouriteButton
        productId={p.id}
        favourited={true}
        signedIn={true}
        onChange={(fav) => {
          if (!fav) onRemove?.(p.id)
        }}
      />
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <ProductOfferLink
          product={p}
          className="text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black px-3 py-1.5 rounded-lg hover:opacity-90"
        />

      </div>
    </div>
  )
}
