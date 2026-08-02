import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Label Glossary'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Label Decoder',
    title: 'Supplement Glossary',
    subtitle: 'Proprietary blends, amino spiking, fairy dusting, DIAAS — every label term decoded.',
    tag: 'Glossary',
  })
}
