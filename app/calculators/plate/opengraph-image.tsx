import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Barbell Plate Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Plate Calculator',
    subtitle: 'Enter your target and bar — get the exact plates to load on each side, colour-coded.',
    tag: 'Calculators',
  })
}
