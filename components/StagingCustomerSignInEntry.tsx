'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  startStagingCustomerSignIn,
  STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE,
} from '@/lib/identity/staging-customer-sign-in'
import { stagingCustomerUiEnabled } from '@/lib/identity/staging-customer-ui'

type State =
  | { status: 'ready' }
  | { status: 'starting' }
  | { status: 'held'; message: string }
  | { status: 'disabled' }

/**
 * Preview-only Customer Account entry. Fetches prepare, then document-posts
 * start using the mounted CSRF/cookie contract. Never opens Google.
 */
function submitDocumentPost(action: string, fields: Readonly<Record<string, string>>) {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = action
  form.hidden = true
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  form.submit()
}

export default function StagingCustomerSignInEntry({ autoStart = true }: { autoStart?: boolean }) {
  const enabled = stagingCustomerUiEnabled()
  const [state, setState] = useState<State>(enabled ? { status: autoStart ? 'starting' : 'ready' } : { status: 'disabled' })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled || (!autoStart && attempt === 0)) return
    const controller = new AbortController()
    setState({ status: 'starting' })
    void (async () => {
      const result = await startStagingCustomerSignIn(
        { fetch, origin: window.location.origin },
        controller.signal,
      )
      if (controller.signal.aborted) return
      if (result.status === 'submit') {
        submitDocumentPost(result.action, result.fields)
        return
      }
      setState({ status: 'held', message: result.message })
    })().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setState({ status: 'held', message: STAGING_CUSTOMER_SIGN_IN_HELD_MESSAGE })
    })
    return () => controller.abort()
  }, [autoStart, enabled, attempt])

  if (state.status === 'disabled') {
    return (
      <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-white text-2xl font-black uppercase tracking-wide">Staging customer entry closed</h1>
          <p className="text-lab-muted text-sm">
            This path is only for Preview when staging customer is enabled. Use ordinary sign-in instead.
          </p>
          <Link
            href="/auth"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-lab-lime px-5 text-[11px] font-black uppercase tracking-widest text-black"
          >
            Ordinary sign-in
          </Link>
        </div>
      </div>
    )
  }

  if (state.status === 'held') {
    return (
      <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6 text-center" role="alert">
        <div className="max-w-sm space-y-4">
          <h1 className="text-white text-2xl font-black uppercase tracking-wide">Staging sign-in held</h1>
          <p className="text-lab-muted text-sm">{state.message}</p>
          <p className="text-gray-500 text-xs">
            Google and magic-link are not offered here while staging customer is enabled.
          </p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg border border-lab-lime/50 px-5 text-[11px] font-black uppercase tracking-widest text-lab-lime"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  if (state.status === 'ready') {
    return (
      <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6 text-center">
        <div className="max-w-sm space-y-4">
          <h1 className="text-white text-2xl font-black uppercase tracking-wide">Signed out</h1>
          <p className="text-lab-muted text-sm">Sign in to continue to your unified customer account.</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-lab-lime px-5 text-[11px] font-black uppercase tracking-widest text-black"
          >
            Sign in with Shopify
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-lab-bg flex items-center justify-center px-6 text-center" role="status">
      <div className="max-w-sm space-y-3">
        <h1 className="text-white text-2xl font-black uppercase tracking-wide">Opening staging sign-in</h1>
        <p className="text-lab-muted text-sm">
          Continuing to the Shopify Customer Account journey. This is not Google or magic-link.
        </p>
      </div>
    </div>
  )
}
