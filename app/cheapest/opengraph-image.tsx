import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Cheapest Supplements Per Serving'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Cheapest Per Serving',
    title: 'Cheapest Supplements',
    subtitle: 'Lowest real cost per serving across every category, ranked for the UK.',
    tag: 'Price 2026',
  })
}
