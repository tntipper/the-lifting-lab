import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Peptides: What Works, What Is Legal, What to Avoid'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Peptides, Honestly',
    title: 'What Works, What to Avoid',
    subtitle:
      'Collagen and protein peptides vs BPC-157, TB-500 and the grey-market injectables — the honest, UK-legal, evidence-based verdict.',
    tag: 'Peptides 2026',
  })
}
