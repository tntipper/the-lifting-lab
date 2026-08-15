import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Natural Testosterone Support: What Actually Works'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Testosterone Support',
    title: 'What Actually Works',
    subtitle:
      'Sleep, body fat, vitamin D, zinc and ashwagandha vs tribulus, DAA and "test booster" blends — the honest, evidence-based verdict.',
    tag: 'Testosterone 2026',
  })
}
