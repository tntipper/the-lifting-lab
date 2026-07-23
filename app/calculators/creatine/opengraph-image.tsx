import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Creatine Dosage Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Creatine Dosage Calculator',
    subtitle: 'Your exact loading and maintenance dose for your bodyweight — and how fast you saturate.',
    tag: 'Calculators',
  })
}
