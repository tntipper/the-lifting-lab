'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [refCode, setRefCode] = useState('')

  // Capture a referral code from ?ref= (read client-side to avoid the
  // useSearchParams Suspense requirement on this otherwise-static page).
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('ref')
    if (code) setRefCode(code)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        // Only persisted on first signup; the DB trigger resolves it to the referrer.
        data: refCode ? { referred_by: refCode } : undefined,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-6">📬</div>
          <h1 className="text-white text-2xl font-black uppercase tracking-wide mb-3">Check your email</h1>
          <p className="text-lab-muted mb-2">We sent a magic link to</p>
          <p className="text-lab-lime font-semibold mb-6">{email}</p>
          <p className="text-gray-500 text-sm">Click the link in the email to sign in. No password needed.</p>
          <button
            onClick={() => setSent(false)}
            className="mt-8 text-lab-muted text-sm underline hover:text-white transition-colors"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <span className="font-black uppercase tracking-widest text-3xl">
            THE LIFTING<span className="text-lab-lime">LAB</span>
          </span>
          <p className="text-[10px] text-gray-500 tracking-[0.3em] font-bold mt-1 uppercase">
            Evidence-Based Supplement Stacks · UK
          </p>
          <p className="text-lab-muted mt-5">Sign in to build and track your supplement stack.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-lab-muted text-xs uppercase tracking-widest font-bold mb-2 block">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-lab-panel text-white border border-lab-border rounded-xl px-4 py-3 focus:outline-none focus:border-lab-lime transition-colors"
            />
          </div>

          {error && (
            <p className="text-lab-red text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-lab-lime text-black font-black uppercase tracking-wide rounded-xl px-4 py-3 hover:brightness-110 disabled:opacity-50 transition-all"
          >
            {loading ? 'Sending...' : 'Send magic link'}
          </button>
        </form>

        <p className="text-gray-600 text-xs text-center mt-8">
          No password required. We&apos;ll email you a secure sign-in link.
        </p>
      </div>
    </div>
  )
}
