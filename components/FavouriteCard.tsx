'use client'

import ScoreBadge from '@/components/ScoreBadge'
import FavouriteButton from '@/components/FavouriteButton'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import { buyLink } from '@/lib/affiliate'
import type { ScoredProduct } from '@/lib/products'

// Shared favourited-product card. Used on the /favourites page and the
// dashboard so both surfaces render saved products with identical structure
// (score, brand/name, category, heart, affiliate Buy). The ScoreBadge shows
// the objective formulation score only — reviews are never folded in here.
export default function FavouriteCard({
  product: p,
  onRemove,
}: {
  product: ScoredProduct
  onRemove?: (id: string) => void
}) {
  return (
    <div className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4">
      <ScoreBadge score={p.score} />
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
        <a
          href={buyLink(p.brand, p.name, p.buy_url)}
          target="_blank"
          rel="noopener noreferrer nofollow"
          onClick={() => track('buy_click', { item_brand: p.brand, item_name: p.name })}
          className="text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black px-3 py-1.5 rounded-lg hover:opacity-90"
        >
          Buy
        </a>
        <span className="text-[9px] text-lab-muted/40 leading-tight">affiliate link</span>
      </div>
    </div>
  )
}
