'use client'

import { useShopPanels } from './ShopPanelsContext'

export default function CompareBar({ onCompare }: { onCompare(): void }) {
  const { compared, removeCompare, clearCompare } = useShopPanels()
  if (!compared.length) return null
  return <section className="shop-compare-bar" aria-label="Comparison">
    <div className="shop-compare-slots">{[0, 1, 2].map(index => {
      const product = compared[index]
      return <div key={product?.id ?? index} className={`shop-compare-slot${product ? '' : ' is-empty'}`}>
        <span>{product?.name ?? 'Empty slot'}</span>{product && <button type="button" onClick={() => removeCompare(product.id)} aria-label={`Remove ${product.name} from comparison`}>×</button>}
      </div>
    })}</div>
    <div className="shop-compare-actions"><button type="button" onClick={clearCompare}>Clear</button><div><button type="button" className="shop-primary" disabled={compared.length < 2} onClick={onCompare}>Compare {compared.length} of 3</button><p>{compared.length < 2 ? 'Pick at least 2 products' : 'Up to 3 at a time'}</p></div></div>
  </section>
}
