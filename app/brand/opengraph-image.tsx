import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Brands A–Z'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Brands A–Z',
    title: 'Supplement Brands',
    subtitle: 'Every brand we track, scored on how well their products actually dose.',
    tag: 'Directory',
  })
}
