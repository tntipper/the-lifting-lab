import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Listed Protein Prices'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Supplement research', title: 'Listed Protein Prices', subtitle: 'Price per recorded gram of protein. Label data and current retailer prices require checking.', tag: 'Assessment review incomplete' })
}
