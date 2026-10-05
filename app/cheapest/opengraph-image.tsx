import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Listed Serving Prices'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Supplement research', title: 'Listed Serving Prices', subtitle: 'Positive listed price per known serving, excluding delivery and checkout costs. No health endorsement.', tag: 'Assessment review incomplete' })
}
