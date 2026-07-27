import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Beta-Alanine Dosage Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Beta-Alanine Dosage Calculator',
    subtitle: 'Your exact daily dose for your bodyweight — how to split it to kill the tingles, and days per tub.',
    tag: 'Calculators',
  })
}
