import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Label Research'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE
export default function Image() {
  return renderOgCard({ eyebrow: 'Supplement research', title: 'Label Research', subtitle: 'Unverified percentages cannot establish an underdosing verdict or recommended replacement.', tag: 'Assessment review incomplete' })
}
