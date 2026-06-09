'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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
      <div className="min-h-screen bg-black flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-6">📬</div>
          <h1 className="text-white text-2xl font-bold mb-3">Check your email</h1>
          <p className="text-gray-400 mb-2">We sent a magic link to</p>
          <p className="text-white font-medium mb-6">{email}</p>
          <p className="text-gray-500 text-sm">Click the link in the email to sign in. No password needed.</p>
          <button
            onClick={() => setSent(false)}
            className="mt-8 text-gray-400 text-sm underline"
          >
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-10">
          <h1 className="text-white text-3xl font-bold mb-2">The Lifting Lab</h1>
          <p className="text-gray-400">Sign in to track your supplement stack</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-2 block">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full bg-gray-900 text-white border border-gray-700 rounded-xl px-4 py-3 focus:outline-none focus:border-white transition-colors"
            />
          </div>

          {error && (
            <p className="text-red-400 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-white text-black font-semibold rounded-xl px-4 py-3 hover:bg-gray-100 disabled:opacity-50 transition-colors"
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
