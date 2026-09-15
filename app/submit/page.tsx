'use client'

import { isSyntheticPreview } from '@/lib/preview-mode'
import PreviewUnavailableContent from '@/components/PreviewUnavailableContent'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'
import { submissionSizeError } from '@/lib/submissions/body-size.mjs'

export default function SubmitPage() {
  return isSyntheticPreview() ? <PreviewUnavailableContent /> : <SubmitPageForm />
}

function SubmitPageForm() {
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [product, setProduct] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const retry = useRef<{ body: string; key: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const body = JSON.stringify({ category, brand, product, url, notes, email })
      const sizeError = submissionSizeError(body)
      if (sizeError) { setErrorMessage(sizeError); setStatus('error'); return }
      if (!retry.current || retry.current.body !== body) retry.current = { body, key: crypto.randomUUID() }
      const r = await fetch('/api/submit-supplement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': retry.current.key },
        body,
      })
      if (!r.ok) {
        const result = await r.json().catch(() => ({}))
        setErrorMessage(typeof result.error === 'string' ? result.error : 'Your submission could not be received. Please try again.')
        if (r.status === 409) retry.current = null
      }
      setStatus(r.ok ? 'done' : 'error')
    } catch {
      setErrorMessage('Your submission could not be confirmed. Please try again.')
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <div className="sticky top-0 z-20 bg-lab-bg/95 backdrop-blur border-b border-lab-border px-4 py-3">
        <Link href="/" className="text-lab-muted hover:text-white text-sm font-bold uppercase tracking-widest">
          ← Home
        </Link>
      </div>

      <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
        <div>
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-lime mb-2">Missing Something?</p>
          <h1 className="text-2xl font-black uppercase">Submit a Supplement</h1>
          <p className="text-lab-muted text-sm mt-2">Suggest a supplement for editorial review. Submission does not guarantee publication or a score.</p>
        </div>

        {status === 'done' ? (
          <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-bold text-white">Suggestion received for review.</p>
            <p className="text-lab-muted text-sm">Thank you for helping us identify products to assess.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="supplement-category" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Category *</label>
              <select
                id="supplement-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
              >
                <option value="">Select a category</option>
                {CATEGORIES.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="supplement-brand" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Brand *</label>
              <input
                id="supplement-brand"
                maxLength={120}
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
                placeholder="e.g. Bulk"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label htmlFor="supplement-product" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Product name *</label>
              <input
                id="supplement-product"
                maxLength={200}
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                required
                placeholder="e.g. Mega Pre"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label htmlFor="supplement-url" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Product URL *</label>
              <input
                type="url"
                id="supplement-url"
                maxLength={2048}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://www.bulk.com/uk/..."
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label htmlFor="supplement-notes" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Notes (optional)</label>
              <textarea
                id="supplement-notes"
                maxLength={4000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything we should know — flavour, dose quirks..."
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors resize-none placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label htmlFor="supplement-email" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Your email (optional)</label>
              <input
                type="email"
                id="supplement-email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="optional contact email"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            {status === 'error' && (
              <p role="alert" className="text-lab-red text-sm">{errorMessage}</p>
            )}
            <button
              type="submit"
              disabled={status === 'sending'}
              className="w-full text-sm uppercase tracking-widest font-bold bg-lab-lime text-black py-3 rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {status === 'sending' ? 'Submitting…' : 'Submit for review'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
