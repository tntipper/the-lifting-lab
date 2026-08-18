import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Dosage Guide: How Much of Everything to Take'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Dosage Cheat Sheet',
    title: 'How Much of Everything to Take',
    subtitle:
      'The evidence-based dose, timing and form for creatine, caffeine, protein, beta-alanine, citrulline, vitamin D and more — plus where more stops helping.',
    tag: 'Dosage 2026',
  })
}
