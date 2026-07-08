import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'
import { categoryLabel } from '@/lib/categories'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Best in Category 2026'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// DB-free: the ranking itself needs Supabase, but the share card only needs the
// category label (local data), so the OG edge function can never fail at runtime.
export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const label = categoryLabel(category)
  return renderOgCard({
    eyebrow: 'Best in Category · 2026',
    title: `Best ${label}`,
    subtitle: 'Ranked by how closely each product hits its evidence-based effective dose.',
    tag: 'UK Rankings',
  })
}
