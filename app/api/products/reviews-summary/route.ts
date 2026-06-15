import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'

// GET /api/products/reviews-summary
// Public, read-only. Returns a map keyed by product id with the aggregate
// review signal used on the browse cards (F12): average stars, visible review
// count, and the most-recent non-empty review snippet.
//
// One query, aggregated in-process — avoids the N+1 of fetching reviews per
// card. RLS on `reviews` already restricts anon to visible rows (approved, or
// pending past the 24h auto-approve window), so the public client sees exactly
// the same set the product-detail page shows a logged-out visitor.

type ReviewRow = { product_id: string; rating: number; body: string | null; created_at: string }

export type ReviewSummary = {
  average: number // 1 decimal, rounded
  count: number
  latest: string | null // most-recent review with a non-empty body, untruncated
}

export async function GET() {
  const sb = createPublicClient()
  // Newest first so the first body we see per product is the latest snippet.
  const { data, error } = await sb
    .from('reviews')
    .select('product_id, rating, body, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const acc = new Map<string, { sum: number; count: number; latest: string | null }>()
  for (const row of (data as ReviewRow[] | null) ?? []) {
    let entry = acc.get(row.product_id)
    if (!entry) {
      entry = { sum: 0, count: 0, latest: null }
      acc.set(row.product_id, entry)
    }
    entry.sum += row.rating
    entry.count += 1
    // Rows arrive newest-first, so keep the first non-empty body we encounter.
    if (entry.latest === null && typeof row.body === 'string' && row.body.trim()) {
      entry.latest = row.body.trim()
    }
  }

  const summary: Record<string, ReviewSummary> = {}
  for (const [productId, e] of acc) {
    summary[productId] = {
      average: Math.round((e.sum / e.count) * 10) / 10,
      count: e.count,
      latest: e.latest,
    }
  }

  return NextResponse.json(summary)
}
