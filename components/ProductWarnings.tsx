import { productWarningsFor } from '@/lib/commerce/product-warnings'
import type { ComparedProduct } from '@/lib/products'

export default function ProductWarnings({ product }: { product: ComparedProduct }) {
  const warnings = productWarningsFor(product)
  if (!warnings.length) return null
  return <section aria-label="Product warnings" className="rounded-2xl border border-yellow-700/50 bg-lab-panel p-5">
    <h2 className="text-sm font-bold text-yellow-300">Product warnings</h2>
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-white/90">
      {warnings.map(warning => <li key={warning.code}>{warning.text}</li>)}
    </ul>
    <p className="mt-3 text-xs text-lab-muted">Local label data may be incomplete. Read the current pack before use. A missing notice here does not establish suitability.</p>
  </section>
}
