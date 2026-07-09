import { OG_SIZE, OG_CONTENT_TYPE, renderVsCard, vsSidesFromSlug } from '@/lib/og-card'

// Per-page branded share card for ingredient-vs-ingredient comparisons. Derived
// entirely from the matchup slug (no I/O), so this edge fn can never fail at
// runtime. Completes branded OG coverage across all three head-to-head classes
// (/vs products, /brands-vs brands, /ingredients-vs ingredients).
export const runtime = 'edge'
export const alt = 'The Lifting Lab — Ingredient Head-to-Head'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default async function Image({ params }: { params: Promise<{ matchup: string }> }) {
  const { matchup } = await params
  const [a, b] = vsSidesFromSlug(matchup)
  return renderVsCard({ tag: 'Ingredient Face-Off 2026', a, b })
}
