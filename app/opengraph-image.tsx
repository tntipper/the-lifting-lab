import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Research'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Labels and listed prices', title: 'Supplement Research', subtitle: 'Effectiveness recommendations unavailable. Historical values remain unverified.', tag: 'Research catalogue' })
}
