'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [refCode, setRefCode] = useState('')
  const [googleLoading, setGoogleLoading] = useState(false)

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

  async function handleGoogle() {
    setGoogleLoading(true)
    setError('')
    const supabase = createClient()
    // Carry any referral code through the OAuth round-trip via the callback URL.
    const next = refCode ? `/dashboard?ref=${encodeURIComponent(refCode)}` : '/dashboard'
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    })
    // On success the browser redirects to Google, so we only reach here on error.
    if (error) {
      setError(error.message)
      setGoogleLoading(false)
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

        <button
          type="button"
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className="w-full flex items-center justify-center gap-3 bg-white text-black font-semibold rounded-xl px-4 py-3 hover:brightness-95 disabled:opacity-50 transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"/>
            <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"/>
            <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"/>
            <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"/>
          </svg>
          {googleLoading ? 'Redirecting…' : 'Continue with Google'}
        </button>

        <div className="flex items-center gap-3 my-6">
          <div className="h-px flex-1 bg-lab-border" />
          <span className="text-gray-600 text-xs uppercase tracking-widest">or</span>
          <div className="h-px flex-1 bg-lab-border" />
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
