import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Side Effects & Safety'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Side Effects & Safety',
    title: 'Supplement Side Effects & Safety',
    subtitle:
      'Creatine, pre-workout, whey, ashwagandha, fat burners — the real side effects, the rare risks, and who should be careful.',
    tag: 'Safety 2026',
  })
}
