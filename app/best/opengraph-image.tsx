import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Best Supplements 2026'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'The 2026 Awards',
    title: 'Best Supplements',
    subtitle: "Every category's top-scoring pick, judged on effective doses — not marketing.",
    tag: 'Rankings 2026',
  })
}
