'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { GA_MEASUREMENT_ID } from '@/lib/gtag'
import { analyticsPageFields, NO_CAMPAIGN_ATTRIBUTION } from '@/lib/analytics-data'
import {
  ANALYTICS_CHOICE_KEY, analyticsAllowed, clearAnalyticsCookies,
  readAnalyticsChoice, saveAnalyticsChoice, type AnalyticsChoice,
} from '@/lib/analytics-consent'

type AnalyticsFrameWindow = Window & {
  tllAnalyticsStart?: (config: Record<string, unknown>) => void
  tllAnalyticsDispatch?: (command: unknown[]) => void
  tllAnalyticsStop?: () => void
}
function frameWindow(): AnalyticsFrameWindow | null {
  return (document.getElementById('tll-analytics-frame') as HTMLIFrameElement | null)?.contentWindow as AnalyticsFrameWindow | null
}

const disableKey = `ga-disable-${GA_MEASUREMENT_ID}`
function disableAnalytics() {
  frameWindow()?.tllAnalyticsStop?.()
  Object.assign(window, { [disableKey]: true })
  window.gtag = undefined
  window.dataLayer = []
  clearAnalyticsCookies()
}

export default function AnalyticsPreferences() {
  const pathname = usePathname()
  const lastPage = useRef<string | null>(null)
  const [choice, setChoice] = useState<AnalyticsChoice | null>(null)
  const [ready, setReady] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(false)
  const busy = useRef(false)
  const active = useRef(false)
  const initialised = useRef(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const stored = readAnalyticsChoice()
    if (stored !== 'accepted') disableAnalytics()
    // Also remove inherited identifiers before starting with host-only cookies.
    else clearAnalyticsCookies(true)
    active.current = stored === 'accepted'
    // Browser storage is read after hydration; the server always renders OFF.
    setChoice(stored)
    setOpen(stored === null)
    setReady(true)

    const sync = () => {
      if (active.current && !analyticsAllowed()) {
        disableAnalytics()
        // Unmounting a script cannot discard its timers/listeners; reload does.
        window.location.reload()
      }
    }
    const storage = (event: StorageEvent) => {
      if (event.key === ANALYTICS_CHOICE_KEY || event.key === null) sync()
    }
    window.addEventListener('storage', storage)
    window.addEventListener('focus', sync)
    const expiry = window.setInterval(() => {
      sync()
    }, 1000)
    return () => {
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', sync)
      window.clearInterval(expiry)
    }
  }, [])

  function pageView() {
    if (!active.current || !analyticsAllowed() || !window.gtag) return
    const page = window.location.href
    if (lastPage.current === page) return
    lastPage.current = page
    const fields = analyticsPageFields()
    window.gtag('set', fields)
    window.gtag('config', GA_MEASUREMENT_ID, { update: true, send_page_view: false, ...fields })
    window.gtag('event', 'page_view', fields)
  }

  useEffect(() => {
    if (initialised.current) pageView()
    // The effect tracks supported pathname navigation; current browser URL and
    // preference are read at dispatch time, not captured from an earlier render.
  }, [pathname])

  function choose(next: AnalyticsChoice) {
    if (busy.current) return
    busy.current = true
    if (next === 'rejected') disableAnalytics()
    if (!saveAnalyticsChoice(next)) {
      disableAnalytics()
      setChoice(null)
      setError(true)
      busy.current = false
      // If all persistence is blocked, keep the disabled runtime in place.
      // Reloading could re-enable an older, still-readable acceptance.
      active.current = false
      return
    }
    if ((choice === 'accepted' && next === 'rejected') ||
        (next === 'accepted' && initialised.current && choice !== 'accepted')) {
      window.location.reload()
      return
    }
    active.current = next === 'accepted'
    setChoice(next)
    setOpen(false)
    setError(false)
    trigger.current?.focus()
    busy.current = false
  }

  const buttonClass = 'rounded border border-lab-lime px-4 py-2 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-lab-lime'
  return (
    <>
      <div className="bg-lab-bg text-white border-b border-lab-border px-4 py-3">
        <button ref={trigger} type="button" aria-expanded={open} aria-controls="analytics-preferences"
          className="text-sm underline text-lab-lime focus-visible:outline-2 focus-visible:outline-offset-4"
          onClick={() => { setOpen(true); requestAnimationFrame(() => heading.current?.focus()) }}>
          Analytics preferences
        </button>
        {ready && open && (
          <section id="analytics-preferences" aria-labelledby="analytics-heading" className="max-w-3xl mx-auto py-4">
            <h2 id="analytics-heading" ref={heading} tabIndex={-1} className="text-lg font-bold">Optional analytics</h2>
            <p className="text-sm my-3">We use Google Analytics to understand page visits and feature use, with cookies that identify your browser. Analytics stays off until you accept. You can reject or withdraw here at any time. Essential account and saved-stack features work either way. <a href="/privacy" className="underline text-lab-lime">Privacy policy</a>.</p>
            <p className="text-sm mb-3">Current choice: {choice === 'accepted' ? 'analytics on' : choice === 'rejected' ? 'analytics off (rejected)' : 'analytics off (no saved choice)'}.</p>
            {error && <p role="alert" className="text-sm mb-3">Your browser could not save the choice. Analytics is stopped in this page, but your browser could not remember the change. An older saved choice may apply on your next visit. Allow site storage to save a preference.</p>}
            <div className="flex flex-wrap gap-3">
              <button type="button" className={buttonClass} onClick={() => choose('rejected')}>{choice === 'accepted' ? 'Withdraw analytics consent' : 'Reject analytics'}</button>
              <button type="button" className={buttonClass} onClick={() => choose('accepted')}>Accept analytics</button>
              <button type="button" className={buttonClass} onClick={() => { setOpen(false); trigger.current?.focus() }}>Close preferences</button>
            </div>
          </section>
        )}
      </div>
      {ready && choice === 'accepted' && (
        <iframe id="tll-analytics-frame" src="/analytics-frame.html" title="Optional analytics transport"
          hidden aria-hidden="true" tabIndex={-1} referrerPolicy="no-referrer"
          onLoad={() => {
            if (!active.current || !analyticsAllowed()) { disableAnalytics(); return }
            const child = frameWindow()
            if (!child?.tllAnalyticsStart || initialised.current) return
            initialised.current = true
            child.tllAnalyticsStart({
              ...analyticsPageFields(), ...NO_CAMPAIGN_ATTRIBUTION,
              url_passthrough: false, send_page_view: false, cookie_domain: 'none', cookie_flags: 'SameSite=Lax;Secure',
              allow_google_signals: false, allow_ad_personalization_signals: false,
            })
            window.gtag = (...command) => {
              if (active.current && analyticsAllowed()) child.tllAnalyticsDispatch?.(command)
            }
            pageView()
          }} />
      )}
    </>
  )
}
