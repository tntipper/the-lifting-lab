import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Which Supplement Form Should You Buy?'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Which Form to Buy',
    title: 'Supplement Forms Compared',
    subtitle:
      'Monohydrate vs HCL, glycinate vs oxide, isolate vs concentrate, D2 vs D3 — the form worth buying, and the ones to skip.',
    tag: 'Forms 2026',
  })
}
