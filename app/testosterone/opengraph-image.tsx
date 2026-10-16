import { TESTOSTERONE_REVIEW } from '@/lib/claims-review'
import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = TESTOSTERONE_REVIEW.title
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Testosterone Information',
    title: 'Claims Under Review',
    subtitle: TESTOSTERONE_REVIEW.description,
    tag: 'Evidence review in progress',
  })
}
