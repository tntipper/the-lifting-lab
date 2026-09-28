'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  parseCustomerOrdersProjection,
  type CustomerOrdersProjection,
} from '@/lib/identity/customer-orders-projection'

type State =
  | { status: 'loading' }
  | { status: 'held' }
  | { status: 'ready'; value: CustomerOrdersProjection }

const label = (value: string | null) =>
  value ? value.toLowerCase().replaceAll('_', ' ').replace(/^./, char => char.toUpperCase()) : 'Pending'
const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })

export default function AccountOrders() {
  const [state, setState] = useState<State>({ status: 'loading' })
  const load = useCallback(async (signal?: AbortSignal) => {
    setState({ status: 'loading' })
    try {
      const response = await fetch('/api/account/orders', {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal,
      })
      const body = await response.text()
      if (response.status !== 200 || body.length > 65_536) throw new Error('held')
      const value = parseCustomerOrdersProjection(JSON.parse(body))
      if (!value) throw new Error('held')
      setState({ status: 'ready', value })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setState({ status: 'held' })
    }
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    void load(controller.signal)
    return () => controller.abort()
  }, [load])

  if (state.status === 'loading') {
    return (
      <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 text-sm text-lab-muted" role="status">
        Loading your recent orders…
      </div>
    )
  }
  if (state.status === 'held') {
    return (
      <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
        <p className="font-bold">Your shop orders are unavailable right now.</p>
        <p className="text-sm text-lab-muted mt-1">
          Your account remains protected. Try again once; if this continues, sign in again.
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 min-h-11 rounded-xl border border-lab-lime/50 px-4 text-xs font-black uppercase tracking-widest text-lab-lime hover:bg-lab-lime/10"
        >
          Try again
        </button>
      </div>
    )
  }
  if (state.value.orders.length === 0) {
    return (
      <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 text-sm text-lab-muted">
        No shop orders yet.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {state.value.orders.map(order => (
        <article
          key={`${order.reference}:${order.createdAt}`}
          className="bg-lab-panel border border-lab-border rounded-2xl p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-black text-lg">Order {order.reference}</h2>
              <p className="text-xs text-lab-muted mt-1">
                {new Date(order.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
            </div>
            <p className="font-black text-lab-lime">{money.format(order.totalPence / 100)}</p>
          </div>
          <div className="flex flex-wrap gap-2 mt-4 text-[10px] font-bold uppercase tracking-widest">
            <span className="rounded-full border border-lab-border px-3 py-1 text-white/80">
              {label(order.financialStatus)}
            </span>
            <span className="rounded-full border border-lab-border px-3 py-1 text-white/80">
              {label(order.fulfillmentStatus)}
            </span>
          </div>
          <ul className="mt-4 space-y-2 text-sm">
            {order.items.map((item, index) => (
              <li key={`${item.name}:${index}`} className="flex justify-between gap-4">
                <span>{item.name}</span>
                <span className="text-lab-muted shrink-0">× {item.quantity}</span>
              </li>
            ))}
          </ul>
          {order.hasMoreItems && (
            <p className="text-xs text-lab-muted mt-3">More items are included in this order.</p>
          )}
        </article>
      ))}
      {state.value.hasMoreOrders && (
        <p className="text-xs text-lab-muted text-center">Showing your 10 most recent orders.</p>
      )}
    </div>
  )
}
