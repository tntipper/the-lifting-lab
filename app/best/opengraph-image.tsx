import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Category Research'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Supplement research', title: 'Category Research', subtitle: 'Effectiveness rankings unavailable. Historical values are unverified.', tag: 'Assessment review incomplete' })
}
