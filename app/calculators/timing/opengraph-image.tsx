import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Timing Planner'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Supplement Timing Planner',
    subtitle: 'When to actually take each supplement — a daily schedule built around your training time, and the timing myths you can ignore.',
    tag: 'Calculators',
  })
}
