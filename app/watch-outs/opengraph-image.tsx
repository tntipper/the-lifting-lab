import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplements to Avoid'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Red Flags',
    title: 'Supplements to Avoid',
    subtitle: 'The lowest-scoring picks — underdosed, amino-spiked or hidden in blends.',
    tag: 'Watch-Outs',
  })
}
