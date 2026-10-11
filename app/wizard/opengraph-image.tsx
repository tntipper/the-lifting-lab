import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Find My Stack'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Find My Stack',
    title: 'Build Your Stack',
    subtitle: 'Product recommendations unavailable. Browse research records and build a manual stack.',
    tag: 'Free Tool',
  })
}
