'use client'

import { useId } from 'react'
import type { ProductSizeOption } from '@/lib/commerce/size-selection'

export default function ProductSizePicker({ options, selected, onChange }: {
  options: readonly ProductSizeOption[]; selected: ProductSizeOption; onChange: (slug: string) => void
}) {
  const id = useId()
  if (options.length < 2) return null
  return <div className="space-y-2">
    <label htmlFor={id} className="block text-sm font-bold">Size</label>
    <select id={id} value={selected.slug} onChange={event => onChange(event.target.value)}
      className="min-h-11 w-full rounded-lg border border-lab-border bg-lab-panel px-3 text-white">
      {options.map(option => <option key={option.slug} value={option.slug}>{option.label}</option>)}
    </select>
  </div>
}
