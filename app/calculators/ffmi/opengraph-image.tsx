import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — FFMI Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'FFMI Calculator',
    subtitle: 'Score your muscle mass against the natural limit — enter height, weight and body fat.',
    tag: 'Calculators',
  })
}
