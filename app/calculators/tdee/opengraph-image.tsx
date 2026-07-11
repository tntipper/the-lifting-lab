import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — TDEE & Macro Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'TDEE & Macro Calculator',
    subtitle: 'Find your maintenance calories, then your protein, carb and fat targets for any goal.',
    tag: 'Calculators',
  })
}
