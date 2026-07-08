import { OG_SIZE, OG_CONTENT_TYPE, ogHook, renderOgCard } from '@/lib/og-card'
import { getStackGuide } from '@/lib/stacks'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Stack by Goal'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

// DB-free: the resolved stack needs Supabase, but the share card only needs the
// goal's local copy (eyebrow/h1/description), so it can never fail at runtime.
export default async function Image({ params }: { params: Promise<{ goal: string }> }) {
  const { goal } = await params
  const stack = getStackGuide(goal)
  const eyebrow = stack ? stack.eyebrow : 'Goal-Based Stacks'
  const title = stack ? stack.h1 : 'Supplement Stacks'
  const subtitle = stack
    ? ogHook(stack.metaDescription)
    : 'Complete, evidence-based supplement stacks for every goal.'
  return renderOgCard({ eyebrow, title, subtitle, tag: 'Stack 2026' })
}
