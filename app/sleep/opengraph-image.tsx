import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Best Supplements for Sleep: What Actually Works'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Sleep & Recovery',
    title: 'What Actually Works',
    subtitle:
      'A fixed schedule, caffeine timing, magnesium, ashwagandha and melatonin vs GABA, 5-HTP and "PM" blends — the honest, evidence-based verdict.',
    tag: 'Sleep 2026',
  })
}
