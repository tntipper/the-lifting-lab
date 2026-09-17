'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { stagingCartUiEnabled, type StagingCartView } from '@/lib/commerce/staging-cart-types'
import StagingCartPanel from './StagingCartPanel'
import { StagingCartContext, type CartContext } from './StagingCartContext'

function parse(value: unknown): StagingCartView {
  if (!value || typeof value !== 'object') throw new Error('Cart response unavailable')
  const view = value as StagingCartView
  if (!['empty', 'ready', 'pending', 'held', 'unavailable', 'session_changed'].includes(view.state)
    || !Number.isSafeInteger(view.revision) || view.revision < 0 || !Number.isSafeInteger(view.quantity) || view.quantity < 0 || view.quantity > 5
    || view.currency !== 'GBP' || typeof view.message !== 'string' || view.message.length > 500
    || view.subtotalPence !== null && (!Number.isSafeInteger(view.subtotalPence) || view.subtotalPence < 0)
    || view.unitPricePence !== null && (!Number.isSafeInteger(view.unitPricePence) || view.unitPricePence <= 0)
    || view.productId !== null && typeof view.productId !== 'string'
    || view.csrfToken !== null && !/^[a-f0-9]{64}$/.test(view.csrfToken)) throw new Error('Cart response unavailable')
  return view
}

export default function StagingCartProvider({ children }: { children: ReactNode }) {
  const enabled = stagingCartUiEnabled(), [view, setView] = useState<StagingCartView | null>(null)
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [opened, setOpened] = useState(false)
  const current = useRef<StagingCartView | null>(null), generation = useRef(0), mutation = useRef(false), mounted = useRef(false), readSequence = useRef(0)
  const returnFocus = useRef<HTMLElement | null>(null), panelOpen = useRef(false)
  const open = useCallback(() => {
    if (!panelOpen.current) {
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      panelOpen.current = true
    }
    setOpened(true)
  }, [])
  const close = useCallback(() => { panelOpen.current = false; setOpened(false) }, [])
  const invalidate = useCallback(() => { generation.current++; readSequence.current++ }, [])
  const commit = useCallback((next: StagingCartView) => { current.current = next; setView(next) }, [])
  const refresh = useCallback(async () => {
    if (!enabled || !mounted.current || mutation.current) return
    const ownerGeneration = generation.current, sequence = ++readSequence.current
    setBusy(true)
    try {
      const result = await fetch('/api/cart', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(12000) })
      const next = parse(await result.json())
      if (ownerGeneration !== generation.current || sequence !== readSequence.current) return
      commit(next); setNotice(next.message)
    } catch {
      if (ownerGeneration === generation.current && sequence === readSequence.current) {
        current.current = null; setView(null); setNotice('The cart could not be refreshed. Check again before making a change.')
      }
    } finally { if (ownerGeneration === generation.current && sequence === readSequence.current) setBusy(false) }
  }, [commit, enabled])

  useEffect(() => {
    if (!enabled) return
    let active = true
    mounted.current = true
    void refresh()
    const subscription = createClient().auth.onAuthStateChange(event => {
      if (!active || !['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return
      invalidate(); current.current = null; setView(null); setNotice('Account context changed. The previous cart has not been transferred.'); setBusy(false)
      // A pending request may still complete for its original cart. Its response
      // is discarded; the next read verifies server context before showing data.
      if (!mutation.current) void refresh()
    })
    return () => { active = false; mounted.current = false; invalidate(); subscription.data.subscription.unsubscribe() }
  }, [enabled, invalidate, refresh])

  const setQuantity = useCallback(async (quantity: number, productId?: string) => {
    if (!enabled || !mounted.current || mutation.current || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 5) return
    let before = current.current
    if (!before || !['ready', 'empty', 'session_changed'].includes(before.state) || productId && before.productId !== productId) return
    open()
    mutation.current = true; readSequence.current++; setBusy(true); setNotice('Checking the test cart change…')
    const ownerGeneration = generation.current
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-TLL-Cart-Intent': 'staging-cart' }
      if (!before.csrfToken) {
        const opened = await fetch('/api/cart', { method: 'POST', headers, credentials: 'same-origin', signal: AbortSignal.timeout(12000), body: JSON.stringify({ action: 'open' }) })
        before = parse(await opened.json())
        if (ownerGeneration !== generation.current) return
        commit(before)
        if (!opened.ok || !before.csrfToken || !['empty', 'ready'].includes(before.state)) { setNotice(before.message); return }
      }
      if (!before.productId || ownerGeneration !== generation.current) return
      const result = await fetch('/api/cart', { method: quantity === 0 ? 'DELETE' : 'PATCH', credentials: 'same-origin', signal: AbortSignal.timeout(30000),
        headers: { ...headers, 'X-TLL-Cart-CSRF': before.csrfToken!, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ productId: before.productId, revision: before.revision, ...(quantity === 0 ? {} : { quantity }) }),
      })
      const next = parse(await result.json())
      if (ownerGeneration !== generation.current) return
      commit(next)
      setNotice(result.ok && ['ready', 'empty'].includes(next.state) ? quantity === 0 ? 'Item removed from the test cart.' : 'Test cart updated.' : next.message)
    } catch {
      if (ownerGeneration === generation.current) {
        current.current = null; setView(null); setNotice('The response was interrupted. Refresh to inspect the saved cart; this change will not be sent again automatically.')
      }
    } finally {
      mutation.current = false
      if (mounted.current) {
        setBusy(false)
        if (ownerGeneration !== generation.current) void refresh()
      }
    }
  }, [commit, enabled, open, refresh])

  const value: CartContext = { enabled, view, busy, notice, open, close, refresh, setQuantity }
  return <StagingCartContext.Provider value={value}>{children}{enabled && <StagingCartPanel open={opened} onClose={close} returnFocusRef={returnFocus} />}</StagingCartContext.Provider>
}
