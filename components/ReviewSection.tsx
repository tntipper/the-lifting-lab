'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { track } from '@/lib/gtag'
import Avatar from '@/components/Avatar'

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

function Stars({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex" aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          fill={i <= value ? '#e8a020' : 'none'} stroke={i <= value ? '#e8a020' : '#3a3a3a'}
          strokeWidth="2" strokeLinejoin="round">
          <path d="M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17.3 5.5 21 7.3 14.1 2 9.5 9 9z" />
        </svg>
      ))}
    </span>
  )
}

function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 86400000
  if (d < 1) return 'today'
  if (d < 2) return 'yesterday'
  if (d < 30) return `${Math.floor(d)}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function ShareReview({ productName, rating }: { productName?: string; rating?: number }) {
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)

  useEffect(() => {
    setCanNativeShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  function shareText() {
    const stars = rating ? ` ${rating}★` : ''
    const name = productName || 'this supplement'
    return `I reviewed ${name}${stars} on The Lifting Lab 💪 — evidence-based supplement scoring.`
  }

  function open(url: string, network: string) {
    track('review_share', { method: network })
    window.open(url, '_blank', 'noopener,noreferrer,width=600,height=540')
  }

  async function nativeShare() {
    try {
      await navigator.share({ text: shareText(), url: window.location.href })
      track('review_share', { method: 'native' })
    } catch {
      /* user cancelled or share unsupported — ignore */
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href)
      track('review_share', { method: 'copy' })
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  const btn =
    'text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 transition-colors'

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {canNativeShare && (
        <button
          type="button"
          onClick={nativeShare}
          className="text-[11px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg border border-lab-lime/60 text-lab-lime hover:bg-lab-lime/10 transition-colors"
        >
          Share…
        </button>
      )}
      <button
        type="button"
        onClick={() => {
          const url = encodeURIComponent(window.location.href)
          const text = encodeURIComponent(shareText())
          open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, 'x')
        }}
        className={btn}
      >
        𝕏 / Twitter
      </button>
      <button
        type="button"
        onClick={() => {
          const url = encodeURIComponent(window.location.href)
          open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, 'facebook')
        }}
        className={btn}
      >
        Facebook
      </button>
      <button
        type="button"
        onClick={() => {
          const text = encodeURIComponent(`${shareText()} ${window.location.href}`)
          open(`https://wa.me/?text=${text}`, 'whatsapp')
        }}
        className={btn}
      >
        WhatsApp
      </button>
      <button type="button" onClick={copyLink} className={btn}>
        {copied ? '✓ Copied' : 'Copy link'}
      </button>
    </div>
  )
}

export default function ReviewSection({ productId, productName }: { productId: string; productName?: string }) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [average, setAverage] = useState<number | null>(null)
  const [count, setCount] = useState(0)
  // null = auth not resolved yet; only treat as signed-out once we actually know.
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [awarded, setAwarded] = useState<number | null>(null)
  const [awardedRating, setAwardedRating] = useState(0)

  const hasReviewed = reviews.some((r) => r.is_mine)

  useEffect(() => {
    createClient().auth.getUser()
      .then(({ data }) => setSignedIn(!!data.user))
      .catch(() => setSignedIn(false))
    fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) { setReviews(d.reviews || []); setAverage(d.average); setCount(d.count || 0) }
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [productId])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (rating < 1) { setError('Pick a star rating'); return }
    setBusy(true); setError('')
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId, rating, body: body.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (res.status === 401) { window.location.href = '/auth'; return }
        if (res.status === 409) { setError('You already reviewed this product.'); await refresh(); return }
        setError(data.error || 'Could not submit review'); return
      }
      track('review_submit', { item_id: productId, rating })
      setAwarded(typeof data.pointsAwarded === 'number' ? data.pointsAwarded : 0)
      setAwardedRating(rating)
      setBody(''); setRating(0)
      await refresh()
    } catch {
      setError('Network error — try again')
    } finally {
      setBusy(false)
    }
  }

  async function refresh() {
    const d = await fetch(`/api/reviews?productId=${encodeURIComponent(productId)}`).then((r) => r.json()).catch(() => null)
    if (d) { setReviews(d.reviews || []); setAverage(d.average); setCount(d.count || 0) }
  }

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Reviews</p>
        {average != null && (
          <div className="flex items-center gap-2">
            <Stars value={Math.round(average)} />
            <span className="text-sm font-bold text-white">{average.toFixed(1)}</span>
            <span className="text-xs text-lab-muted">({count})</span>
          </div>
        )}
      </div>

      {/* Write a review */}
      {!loading && signedIn && !hasReviewed && awarded == null && (
        <form onSubmit={submit} className="mb-5 bg-lab-bg/40 border border-lab-border rounded-xl p-4">
          <div className="flex items-center gap-1 mb-3" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" onMouseEnter={() => setHover(i)} onClick={() => setRating(i)}
                className="p-0.5 transition-transform active:scale-125" aria-label={`${i} stars`}>
                <svg width="26" height="26" viewBox="0 0 24 24"
                  fill={i <= (hover || rating) ? '#e8a020' : 'none'}
                  stroke={i <= (hover || rating) ? '#e8a020' : '#4a4a4a'} strokeWidth="2" strokeLinejoin="round">
                  <path d="M12 2 15 9l7 .5-5.3 4.6L18.5 21 12 17.3 5.5 21 7.3 14.1 2 9.5 9 9z" />
                </svg>
              </button>
            ))}
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, 280))}
            placeholder="Share your experience (optional, 280 chars)…"
            rows={3}
            className="w-full bg-lab-panel text-white text-sm border border-lab-border rounded-lg px-3 py-2 focus:outline-none focus:border-lab-lime transition-colors resize-none"
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-[11px] text-lab-muted">{body.length}/280</span>
            <button type="submit" disabled={busy}
              className="text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-50 transition-all">
              {busy ? 'Posting…' : 'Post review · +75 pts'}
            </button>
          </div>
          {error && <p className="text-lab-red text-xs mt-2">{error}</p>}
        </form>
      )}

      {awarded != null && (
        <div className="mb-5 bg-lab-lime/10 border border-lab-lime/30 rounded-xl p-4 text-center">
          <p className="text-lab-lime text-sm font-bold">
            {awarded > 0 ? `Review posted · +${awarded} points!` : 'Review posted — thanks!'}
          </p>
          <p className="text-lab-muted text-xs mt-1">It’ll be visible to others after a short review window.</p>
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mt-4 mb-2">Share your review</p>
          <div className="flex justify-center">
            <ShareReview productName={productName} rating={awardedRating} />
          </div>
        </div>
      )}

      {!loading && signedIn === false && (
        <a href="/auth" className="block mb-5 text-center bg-lab-bg/40 border border-lab-border rounded-xl p-4 text-sm text-lab-muted hover:border-lab-lime/50 transition-colors">
          <span className="text-lab-lime font-bold">Sign in</span> to review this product and earn 75 points.
        </a>
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
              <Avatar type={r.avatar_type} avatarId={r.avatar_id} url={r.avatar_url} username={r.username} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-white truncate">{r.display_name || r.username}</span>
                  <Stars value={r.rating} size={12} />
                  <span className="text-[11px] text-lab-muted">{timeAgo(r.created_at)}</span>
                  {r.is_mine && r.status === 'pending' && (
                    <span className="text-[10px] uppercase tracking-widest font-bold text-lab-amber">· pending</span>
                  )}
                </div>
                {r.body && <p className="text-sm text-white/80 mt-1 leading-snug break-words">{r.body}</p>}
                {r.is_mine && (
                  <div className="mt-2">
                    <ShareReview productName={productName} rating={r.rating} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
