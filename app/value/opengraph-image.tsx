import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Best Value Supplements'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'True Cost Rankings',
    title: 'Best Value Supplements',
    subtitle: 'Effectiveness per pound per serving — the cheapest that still actually works.',
    tag: 'Value 2026',
  })
}
