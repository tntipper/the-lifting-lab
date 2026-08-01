import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Discount Codes & Deals UK 2026'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Verified Codes & Deals',
    title: 'Discount Codes',
    subtitle:
      'A verified MyProtein code, live partner offers, and the honest way to actually save on supplements.',
    tag: 'Deals',
  })
}
