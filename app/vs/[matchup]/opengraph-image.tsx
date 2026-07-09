import { OG_SIZE, OG_CONTENT_TYPE, renderVsCard, vsSidesFromSlug } from '@/lib/og-card'

// Per-page branded share card for product head-to-heads. Derived entirely from
// the matchup slug (no DB), so this edge fn can never fail at runtime — the exact
// reason /vs pages previously fell back to the generic root card when shared.
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Head-to-Head Supplement Comparison'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ matchup: string }> }) {
  const { matchup } = await params
  const [a, b] = vsSidesFromSlug(matchup)
  return renderVsCard({ tag: 'Head-to-Head 2026', a, b })
}
