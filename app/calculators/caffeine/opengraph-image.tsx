import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Caffeine Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Caffeine Calculator',
    subtitle: 'Your pre-workout dose for your bodyweight — plus when to stop so it does not wreck your sleep.',
    tag: 'Calculators',
  })
}
