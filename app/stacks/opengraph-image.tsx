import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Stacks by Goal'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Goal-Based Stacks',
    title: 'Supplement Stacks',
    subtitle: 'Goal research records. Product and combined-stack recommendations are unavailable.',
    tag: 'Stacks 2026',
  })
}
