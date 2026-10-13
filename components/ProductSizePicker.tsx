'use client'

import { useId } from 'react'
import type { ProductSizeOption } from '@/lib/commerce/size-selection'

export default function ProductSizePicker({ options, selected, onChange, price = selected.retail_price }: {
  options: readonly ProductSizeOption[]; selected: ProductSizeOption; onChange: (slug: string) => void; price?: number | null
}) {
  const id = useId()
  return <div className="space-y-2">
    {options.length > 1 ? <><label htmlFor={id} className="block text-sm font-bold">Size</label>
    <select id={id} value={selected.slug} onChange={event => onChange(event.target.value)}
      aria-describedby={`${id}-status`} className="min-h-11 w-full rounded-lg border border-lab-border bg-lab-panel px-3 text-white">
      {options.map(option => <option key={option.slug} value={option.slug}>{option.label}</option>)}
    </select></> : <p className="text-sm">Size: {selected.label}</p>}
    <p id={`${id}-status`} role="status" aria-live="polite" className="text-xs text-lab-muted">
      {selected.label}{price != null ? ` · £${price.toFixed(2)}` : ' · Price unavailable'}
    </p>
  </div>
}
