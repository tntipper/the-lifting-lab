import { OG_SIZE, OG_CONTENT_TYPE, renderVsCard, vsSidesFromSlug } from '@/lib/og-card'

// Per-page branded share card for brand-vs-brand showdowns. Derived entirely
// from the matchup slug (no DB), so this edge fn can never fail at runtime — the
// exact reason /brands-vs pages previously fell back to the generic root card.
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Brand Showdown'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ matchup: string }> }) {
  const { matchup } = await params
  const [a, b] = vsSidesFromSlug(matchup)
  return renderVsCard({ tag: 'Brand Showdown 2026', a, b })
}
