import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — RPE Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'RPE Calculator',
    subtitle: 'Rate a set by reps and RPE, estimate your 1RM, and get the exact load for your next set.',
    tag: 'Calculators',
  })
}
