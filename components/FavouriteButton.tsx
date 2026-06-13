'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { track } from '@/lib/gtag'

// Heart toggle for favouriting a product. Favourites are auth-gated (hard gate):
// a signed-out click redirects to /auth rather than saving.
export default function FavouriteButton({
  productId,
  favourited,
  signedIn,
  onChange,
  size = 'md',
}: {
  productId: string
  favourited: boolean
  signedIn: boolean
  onChange?: (favourited: boolean) => void
  size?: 'sm' | 'md'
}) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()
  const dim = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'

  async function toggle() {
    if (!signedIn) {
      router.push('/auth')
      return
    }
    if (busy) return
    setBusy(true)
    const next = !favourited
    try {
      const res = await fetch('/api/favourites', {
        method: next ? 'POST' : 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })
      if (!res.ok) {
        if (res.status === 401) router.push('/auth')
        return
      }
      if (next) track('favourite_add', { item_id: productId })
      onChange?.(next)
    } catch {
      // network error — leave state unchanged
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={favourited}
      aria-label={favourited ? 'Remove from favourites' : 'Add to favourites'}
      title={favourited ? 'Remove from favourites' : 'Add to favourites'}
      className="shrink-0 p-1 rounded-lg disabled:opacity-40 transition-transform active:scale-125"
      style={{ color: favourited ? '#F0247A' : undefined }}
    >
      <svg
        viewBox="0 0 24 24"
        className={dim}
        fill={favourited ? '#F0247A' : 'none'}
        stroke={favourited ? '#F0247A' : 'currentColor'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={favourited ? { filter: 'drop-shadow(0 0 6px rgba(240,36,122,0.75))' } : { color: '#9b9b9b' }}
      >
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
    </button>
  )
}
