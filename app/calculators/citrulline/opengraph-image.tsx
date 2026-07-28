import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Citrulline Dosage Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Citrulline Dosage Calculator',
    subtitle: 'How much of your form to weigh out to hit an effective L-citrulline dose — and whether your pre-workout underdoses it.',
    tag: 'Calculators',
  })
}
