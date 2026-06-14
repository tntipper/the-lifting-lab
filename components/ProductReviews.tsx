'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import StarRating from '@/components/StarRating'

type Review = {
  id: string
  user_id: string
  rating: number
  body: string | null
  status: string
  created_at: string
  username: string
  display_name: string | null
  avatar_type: string
  avatar_id: string
  avatar_url: string | null
  is_mine: boolean
}

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (d < 60) return 'just now'
  if (d < 3600) return `${Math.floor(d / 60)}m ago`
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`
  if (d < 2592000) return `${Math.floor(d / 86400)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function ProductReviews({ productId }: { productId: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  // form state
  const [rating, setRating] = useState(0)
  const [body, setBody] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [awarded, setAwarded] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`)
      const d = await r.json()
      if (r.ok) {
        setReviews(d.reviews ?? [])
        setAverage(d.average ?? null)
        setCount(d.count ?? 0)
      }
    } finally {
      setLoading(false)
    }
  }, [productId])

  useEffect(() => {
    load()
    createClient().auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [load])

  const mine = reviews.find((r) => r.is_mine)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) {
      setError('Pick a star rating first.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, body: body.trim() || null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(d.error === 'already_reviewed' ? "You've already reviewed this product." : d.error || 'Could not post review.')
        return
      }
      setAwarded(typeof d.pointsAwarded === 'number' ? d.pointsAwarded : null)
      setRating(0)
      setBody('')
      await load()
    } catch {
      setError('Network error — try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Reviews</p>
        {count > 0 && average != null && (
          <div className="flex items-center gap-2">
            <StarRating value={average} />
            <span className="text-xs text-white/70">{average.toFixed(1)} · {count}</span>
          </div>
        )}
      </div>

      {/* Write-review form / sign-in prompt / already-reviewed state */}
      {signedIn === false && (
        <Link
          href={`/auth?next=${encodeURIComponent(`/products/${productId}`)}`}
          className="block text-center text-xs font-bold uppercase tracking-widest text-lab-lime border border-lab-lime/40 rounded-xl py-3 mb-5 hover:bg-lab-lime/5 transition-colors"
        >
          Sign in to review · earn 75 pts
        </Link>
      )}

      {signedIn && !mine && awarded === null && (
        <form onSubmit={submit} className="mb-6 bg-lab-panel-2 border border-lab-border rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-lab-muted uppercase tracking-widest font-bold">Your rating</span>
            <StarRating value={rating} onChange={setRating} size={22} />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 280))}
            placeholder="Share how it worked for you (optional)…"
            rows={3}
            className="w-full bg-lab-bg text-white text-sm border border-lab-border rounded-lg px-3 py-2 focus:outline-none focus:border-lab-lime transition-colors resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-gray-600">{body.length}/280 · +75 pts</span>
            {error && <span className="text-lab-red text-xs">{error}</span>}
            <button
              type="submit"
              disabled={submitting}
              className="text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-50 transition-all"
            >
              {submitting ? 'Posting…' : 'Post review'}
            </button>
          </div>
        </form>
      )}

      {awarded !== null && (
        <div className="mb-6 text-center text-sm text-lab-lime border border-lab-lime/40 rounded-xl py-3 bg-lab-lime/5">
          ✓ Review posted{awarded > 0 ? ` · +${awarded} pts` : ''}. Thanks!
        </div>
      )}

      {/* List */}
      {loading ? (
        <p className="text-lab-muted text-sm">Loading reviews…</p>
      ) : reviews.length === 0 ? (
        <p className="text-lab-muted text-sm">No reviews yet — be the first.</p>
      ) : (
        <div className="space-y-4">
          {reviews.map((r) => (
            <div key={r.id} className="flex gap-3">
              <Avatar
                type={r.avatar_type}
                avatarId={r.avatar_id}
                url={r.avatar_url}
                username={r.username}
                size="sm"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">{r.display_name || r.username}</span>
                  {r.is_mine && (
                    <span className="text-[9px] uppercase tracking-widest font-bold text-lab-lime border border-lab-lime/40 rounded px-1.5 py-0.5">You</span>
                  )}
                  {r.status === 'pending' && r.is_mine && (
                    <span className="text-[9px] uppercase tracking-widest font-bold text-yellow-400/80">Pending</span>
                  )}
                  <span className="text-[10px] text-gray-600">{timeAgo(r.created_at)}</span>
                </div>
                <StarRating value={r.rating} size={13} />
                {r.body && <p className="text-sm text-white/80 leading-snug mt-1">{r.body}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
