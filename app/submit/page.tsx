'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CATEGORIES } from '@/lib/categories'

export default function SubmitPage() {
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [product, setProduct] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const r = await fetch('/api/submit-supplement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, brand, product, url, notes, email }),
      })
      setStatus(r.ok ? 'done' : 'error')
    } catch {
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
          <p className="text-lab-muted text-sm mt-2">We&apos;ll review and score it within a few days.</p>
        </div>

        {status === 'done' ? (
          <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-6 text-center space-y-2">
            <p className="text-2xl">✓</p>
            <p className="font-bold text-white">Submitted — we&apos;ll review and score it.</p>
            {email && <p className="text-lab-muted text-sm">We&apos;ll ping you at {email} when it&apos;s live.</p>}
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Category *</label>
              <select
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
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Brand *</label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                required
                placeholder="e.g. Bulk"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Product name *</label>
              <input
                value={product}
                onChange={(e) => setProduct(e.target.value)}
                required
                placeholder="e.g. Mega Pre"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Product URL *</label>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                placeholder="https://www.bulk.com/uk/..."
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Anything we should know — flavour, dose quirks..."
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors resize-none placeholder:text-lab-muted/40"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Your email (optional)</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="we'll ping you when it's live"
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors placeholder:text-lab-muted/40"
              />
            </div>
            {status === 'error' && (
              <p className="text-lab-red text-sm">Something went wrong — please try again.</p>
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
