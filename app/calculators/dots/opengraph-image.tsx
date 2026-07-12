import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — DOTS Relative Strength Calculator'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'DOTS Calculator',
    subtitle: 'Score your total against your bodyweight on the DOTS scale — the modern successor to Wilks.',
    tag: 'Calculators',
  })
}
