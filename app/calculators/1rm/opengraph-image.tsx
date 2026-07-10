import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — One-Rep Max Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'One-Rep Max Calculator',
    subtitle: 'Estimate your 1RM from any set, then get your working loads at every percentage.',
    tag: 'Calculators',
  })
}
