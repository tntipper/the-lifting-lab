'use client'

import { isSyntheticPreview } from '@/lib/preview-mode'
import PreviewUnavailableContent from '@/components/PreviewUnavailableContent'
import { useRef, useState } from 'react'
import Link from 'next/link'

export default function ContactPage() {
  return isSyntheticPreview() ? <PreviewUnavailableContent /> : <ContactPageForm />
}

function ContactPageForm() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  const retry = useRef<{ body: string; key: string } | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const body = JSON.stringify({ name, email, message })
      if (!retry.current || retry.current.body !== body) retry.current = { body, key: crypto.randomUUID() }
      const r = await fetch('/api/contact', {
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
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-lime mb-2">Get In Touch</p>
          <h1 className="text-2xl font-black uppercase">Contact Us</h1>
          <p className="text-lab-muted text-sm mt-2">Send product suggestions, corrections or partnership enquiries for review.</p>
        </div>

        {status === 'done' ? (
          <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-6 text-center space-y-2">
            <p className="text-2xl">💪</p>
            <p className="font-bold text-white">Message received for review.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label htmlFor="contact-name" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Name</label>
              <input
                id="contact-name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
              />
            </div>
            <div>
              <label htmlFor="contact-email" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Email</label>
              <input
                type="email"
                id="contact-email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
              />
            </div>
            <div>
              <label htmlFor="contact-message" className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Message</label>
              <textarea
                id="contact-message"
                maxLength={8000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors resize-none"
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
              {status === 'sending' ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
