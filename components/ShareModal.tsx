'use client'

import { useEffect, useState } from 'react'
import { track } from '@/lib/gtag'

// Honour-system share modal: pre-written copy + social links, then a manual
// "I've shared this" claim that awards points (DB enforces cooldown/age).
export default function ShareModal({
  open, onClose, productId, productName, brand, score,
}: {
  open: boolean
  onClose: () => void
  productId: string
  productName: string
  brand: string
  score: number | null
}) {
  const [url, setUrl] = useState('')
  const [claimed, setClaimed] = useState<null | number>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open && typeof window !== 'undefined') {
      setUrl(`${window.location.origin}/products/${productId}`)
      setClaimed(null); setNote('')
    }
  }, [open, productId])

  if (!open) return null

  const caption =
    `Just checked ${brand} ${productName}${score != null ? ` — scored ${score}/100` : ''} on The Lifting Lab, evidence-based UK supplement scoring. ${url}`

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); setNote('Caption copied') } catch { setNote('') }
  }

  async function claim() {
    setBusy(true); setNote('')
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })
      if (res.status === 401) { window.location.href = '/auth'; return }
      const j = await res.json().catch(() => ({}))
      const pts = typeof j.pointsAwarded === 'number' ? j.pointsAwarded : 0
      setClaimed(pts)
      if (pts > 0) track('share_claim', { item_id: productId })
    } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div className="w-full max-w-md bg-lab-panel border border-lab-border rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Share & earn 25 pts</p>
          <button onClick={onClose} className="text-lab-muted hover:text-white text-lg leading-none">✕</button>
        </div>

        <textarea readOnly value={caption} rows={4}
          className="w-full bg-lab-bg text-white/80 text-sm border border-lab-border rounded-xl px-3 py-2 resize-none" />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <button onClick={copyCaption}
            className="text-[11px] font-bold uppercase tracking-widest rounded-lg px-3 py-2.5 border border-lab-border text-white hover:border-lab-lime/50 transition-colors">
            Copy caption
          </button>
          <a href={xUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('share_open', { item_id: productId, network: 'x' })}
            className="text-[11px] font-bold uppercase tracking-widest rounded-lg px-3 py-2.5 border border-lab-border text-white hover:border-lab-lime/50 transition-colors text-center">
            Share on X
          </a>
          <a href="https://www.tiktok.com/upload" target="_blank" rel="noopener noreferrer" onClick={() => track('share_open', { item_id: productId, network: 'tiktok' })}
            className="text-[11px] font-bold uppercase tracking-widest rounded-lg px-3 py-2.5 border border-lab-border text-white hover:border-lab-lime/50 transition-colors text-center">
            TikTok
          </a>
          <a href="https://www.instagram.com/" target="_blank" rel="noopener noreferrer" onClick={() => track('share_open', { item_id: productId, network: 'instagram' })}
            className="text-[11px] font-bold uppercase tracking-widest rounded-lg px-3 py-2.5 border border-lab-border text-white hover:border-lab-lime/50 transition-colors text-center">
            Instagram
          </a>
        </div>

        <p className="text-[10px] text-lab-muted mt-3">Paste the caption into TikTok/Instagram. Then claim your points below.</p>

        <div className="mt-4 border-t border-lab-border pt-4">
          {claimed == null ? (
            <button onClick={claim} disabled={busy}
              className="w-full text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-4 py-3 hover:brightness-110 disabled:opacity-50 transition-all">
              {busy ? 'Claiming…' : "I've shared this · +25 pts"}
            </button>
          ) : claimed > 0 ? (
            <p className="text-center text-lab-lime text-sm font-bold">🎉 +{claimed} points claimed!</p>
          ) : (
            <p className="text-center text-lab-muted text-sm">
              Already claimed for this product in the last 24h (or your account is under 24h old).
            </p>
          )}
          {note && <p className="text-center text-lab-muted text-xs mt-2">{note}</p>}
        </div>
      </div>
    </div>
  )
}
