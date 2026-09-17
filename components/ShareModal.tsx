'use client'

import { useEffect, useId, useRef, useState } from 'react'
import AccessibleDialog from '@/components/AccessibleDialog'
import { assessmentText } from '@/lib/stack-assessment'
import { useCatalogueAssessments } from '@/components/useCatalogueAssessments'
import { track } from '@/lib/gtag'

// Honour-system share modal: pre-written copy + social links, then a manual
// "I've shared this" claim that awards points (DB enforces cooldown/age).
export default function ShareModal({
  open, onClose, productId, productName, brand,
}: {
  open: boolean
  onClose: () => void
  productId: string
  productName: string
  brand: string
}) {
  const titleId = useId()
  const catalogue = useCatalogueAssessments([productId], open)
  const claimStatus = useRef<HTMLParagraphElement>(null)
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

  const product = catalogue.products[0]
  const caption = product
    ? `${product.brand} ${product.name} — ${assessmentText(product)}. Research record on The Lifting Lab. ${url}`
    : `${brand} ${productName} — ${catalogue.loading ? 'assessment loading' : 'assessment unavailable'}. Check the current research record; no benefit recommendation. ${url}`

  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(caption)}`

  async function copyCaption() {
    try { await navigator.clipboard.writeText(caption); setNote('Caption copied') } catch { setNote('') }
  }

  async function claim() {
    // Keep focus in the modal when the action is disabled or replaced.
    claimStatus.current?.focus()
    setBusy(true); setNote('')
    try {
      const res = await fetch('/api/share', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId }),
      })
      if (res.status === 401) { window.location.href = '/auth'; return }
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNote('Your share claim could not be recorded. Please try again.')
        return
      }
      const pts = typeof j.pointsAwarded === 'number' ? j.pointsAwarded : 0
      setClaimed(pts)
      if (pts > 0) track('share_claim', { item_id: productId })
    } catch {
      setNote('Your share claim could not be recorded. Please try again.')
    } finally { setBusy(false) }
  }

  return (
    <AccessibleDialog open={open} onClose={onClose} labelledBy={titleId}
      className="tll-centered-dialog bg-lab-panel border border-lab-border rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Share & earn 25 pts</h2>
          <button type="button" aria-label="Close share dialog" data-dialog-initial-focus onClick={onClose} className="text-lab-muted hover:text-white text-lg leading-none min-w-11 min-h-11">✕</button>
        </div>

        <textarea aria-label="Share caption" readOnly value={caption} rows={4}
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
          ) : null}
          <p ref={claimStatus} tabIndex={-1} role="status" aria-live="polite" aria-atomic="true" className="text-center text-lab-muted text-xs mt-2">
            {busy ? 'Recording your share claim…' : note || (claimed === null ? '' : claimed > 0
              ? `+${claimed} points claimed!`
              : 'No points were awarded. Your account or this product may not be eligible for another claim yet.')}
          </p>
        </div>
    </AccessibleDialog>
  )
}
