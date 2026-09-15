import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Brands'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Supplement research', title: 'Supplement Brands', subtitle: 'Catalogue records and listed prices. No approved effectiveness ranking.', tag: 'Assessment review incomplete' })
}
