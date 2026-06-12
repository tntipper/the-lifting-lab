'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ContactPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setStatus('sending')
    try {
      const r = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
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
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-lime mb-2">Get In Touch</p>
          <h1 className="text-2xl font-black uppercase">Contact Us</h1>
          <p className="text-lab-muted text-sm mt-2">Product suggestions, corrections, partnership enquiries — we read everything.</p>
        </div>

        {status === 'done' ? (
          <div className="bg-lab-panel border border-lab-lime/40 rounded-2xl p-6 text-center space-y-2">
            <p className="text-2xl">💪</p>
            <p className="font-bold text-white">Message sent — we&apos;ll get back to you soon.</p>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
              />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-widest font-bold text-lab-muted block mb-1">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                rows={5}
                className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors resize-none"
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
              {status === 'sending' ? 'Sending…' : 'Send Message'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
