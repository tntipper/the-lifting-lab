'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import ProductAssessment from '@/components/ProductAssessment'
import { useCatalogueAssessments } from '@/components/useCatalogueAssessments'
import AccessibleDialog from '@/components/AccessibleDialog'
import Link from 'next/link'
import { useLocalStack } from '@/components/LocalStackContext'
import { normaliseNutrientName } from '@/lib/nutrient-limits'

const AR = '166,226,46'

type ReceiptProduct = {
  id: string; name: string; brand: string; retail_price: number | null
  servings_per_container: number | null
  product_nutrients: { nutrient_name: string; amount: number; unit: string }[]
}

export default function StackFAB() {
  const { stack, state, remove, clear, retry } = useLocalStack()
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const catalogue = useCatalogueAssessments(stack.map(item => item.id), open)
  const [details, setDetails] = useState<ReceiptProduct[]>([])
  const detailKey = stack.map(item => item.id).sort().join(',')

  useEffect(() => {
    if (!open || !detailKey) { setDetails([]); return }
    const controller = new AbortController()
    fetch(`/api/products/batch?ids=${encodeURIComponent(detailKey)}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : [])
      .then(data => setDetails(Array.isArray(data) ? data : []))
      .catch(() => setDetails([]))
    return () => controller.abort()
  }, [detailKey, open])

  const receipt = useMemo(() => {
    const servingsFor = (id: string) => {
      const saved = state.snapshot?.items.find(item => item.product_id === id)?.servings_per_day
      return typeof saved === 'number' && Number.isFinite(saved) && saved > 0 ? saved : 1
    }
    const ingredients = new Map<string, { amount: number; unit: string }>()
    for (const product of details) for (const nutrient of product.product_nutrients || []) {
      const name = normaliseNutrientName(nutrient.nutrient_name)
      const current = ingredients.get(name)
      if (!current || current.unit === nutrient.unit) ingredients.set(name, { amount: (current?.amount ?? 0) + nutrient.amount * servingsFor(product.id), unit: nutrient.unit })
    }
    const costs = details.map(product => product.retail_price && product.servings_per_container
      ? product.retail_price / product.servings_per_container * servingsFor(product.id) : null)
    const completeCost = details.length === stack.length && costs.every((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0)
    return { ingredients: [...ingredients.entries()], dailyCost: completeCost ? costs.reduce((sum, value) => sum + value, 0) : null }
  }, [details, stack.length, state.snapshot])

  // keep the panel accessible even when stack empties (so user sees "empty" state briefly)
  const count = stack.length

  return (
    <>
      <AccessibleDialog open={open} onClose={() => setOpen(false)} labelledBy={titleId}
        className="tll-stack-dialog">
        <div className="mx-auto max-w-sm rounded-t-2xl border border-lab-border bg-[#f4f4ef] p-4 text-[#14140f] shadow-[0_-8px_40px_rgba(0,0,0,.18)] sm:rounded-2xl">

          {/* header */}
          <div className="flex items-center justify-between border-b border-lab-border pb-3">
            <div className="flex items-center gap-2">
              <h2 id={titleId}
                className="tll-display text-2xl uppercase"
              >
                My Stack
              </h2>
              {count > 0 && (
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                    style={{ background: '#e7efd5', color: '#4a6e0b' }}
                >
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {count > 0 && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.currentTarget.closest('dialog')?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
                    clear()
                  }}
                  disabled={state.loading || state.busy}

                  className="text-[10px] font-bold uppercase tracking-widest text-lab-muted hover:text-lab-red"
                >
                  {state.identity ? 'Clear saved' : 'Clear all'}
                </button>
              )}
              <button
                type="button"
                aria-label="Close My Stack"
                data-dialog-initial-focus
                onClick={() => setOpen(false)}
                className="min-h-11 rounded-lg border border-[#7c7e72] px-3 text-xs font-bold"
              >
                Close
              </button>
            </div>
          </div>

          <div role="status" aria-live="polite" className="space-y-2 py-2 text-xs text-amber-800">
            {state.loading && <p>Loading your stack…</p>}
            {state.busy && <p>Saving stack…</p>}
            {state.identity && state.guest.length > 0 && <p>{state.guest.length} browser item(s) awaiting confirmation in your account. <button type="button" className="underline" disabled={state.busy || state.loading} onClick={retry}>Save browser items</button></p>}
            {state.error && <p>{state.error} {state.retryable && <button type="button" onClick={retry} disabled={state.busy} className="underline">Retry sync</button>}</p>}
          </div>
          {/* stack items */}
          <div className="max-h-[62dvh] overflow-y-auto rounded-xl border border-lab-border bg-white px-4 py-3">
            {count === 0 && !state.loading && !state.error && (
              <p className="py-6 text-center text-sm text-lab-muted">
                No supplements in your stack yet.<br />
                <span className="text-[11px]">Tap + Stack on any product card.</span>
              </p>
            )}
            {stack.map((item) => {
              const trusted = catalogue.products.find(product => product.id === item.id)
              const display = trusted ?? item
              return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-lab-border py-2 last:border-b-0"
              >
                {/* name */}
                <div className="min-w-0">
                  <Link href={`/products/${item.id}`} onClick={() => setOpen(false)} className="text-xs font-semibold hover:underline">{display.name}</Link>
                  <p className="text-[9px] uppercase tracking-widest text-lab-muted">{display.brand}</p>
                  {/* Stored browser scores are never used as assessments. */}
                  {trusted ? <ProductAssessment product={trusted} size="sm" /> : <span className="text-[9px] text-lab-muted">{catalogue.loading ? 'Loading assessment…' : 'Assessment unavailable'}</span>}
                </div>

                {/* remove */}
                <button
                  type="button"
                  aria-label={`Remove ${display.name} from My Stack`}
                  onClick={(event) => {
                    event.currentTarget.closest('dialog')?.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus()
                    remove(item.id)
                  }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base text-lab-muted hover:bg-lab-panel-2 hover:text-lab-red"
                  disabled={state.loading || state.busy}

                >
                  ×
                </button>
              </div>
            )})}
          </div>

          {count > 0 && <div className="mt-3 rounded-xl border border-lab-border bg-white px-4 py-3">
            <div className="flex items-end justify-between gap-3 border-b border-lab-border pb-3">
              <div><h3 className="font-black">Your stack, one dose</h3><p className="text-[10px] text-lab-muted">Combined from recorded labels</p></div>
              <div className="text-right"><p className="text-[10px] uppercase text-lab-muted">Per day</p><p className="font-mono text-lg font-black">{receipt.dailyCost === null ? '—' : `£${receipt.dailyCost.toFixed(2)}`}</p></div>
            </div>
            <p className="mt-3 text-[10px] font-bold uppercase tracking-widest text-lab-muted">Full stack, per day</p>
            {receipt.ingredients.length > 0 ? <dl className="mt-1 divide-y divide-lab-border">
              {receipt.ingredients.map(([name, value]) => <div key={name} className="grid grid-cols-[1fr_auto] gap-3 py-2 text-xs">
                <dt>{name}</dt><dd className="m-0 font-mono font-bold">{Math.round(value.amount * 100) / 100}{value.unit}</dd>
              </div>)}
            </dl> : <p className="py-3 text-xs text-lab-muted">Ingredient totals are loading or unavailable.</p>}
          </div>}

          {/* footer actions */}
          {count > 0 && (
            <div className="grid gap-2 pt-3">
              <Link
                href="/stack"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-[#14140f] py-3 text-center text-xs font-black text-lab-lime"
              >
                View full stack
              </Link>
              <a href={`mailto:?subject=${encodeURIComponent('My Lifting Lab stack')}&body=${encodeURIComponent(stack.map(item => `${item.brand} ${item.name}`).join('\n'))}`}
                className="rounded-lg border border-[#7c7e72] py-3 text-center text-xs font-black">Email me this stack</a>
            </div>
          )}
          {count === 0 && <div className="pb-6" />}
        </div>
      </AccessibleDialog>

      {/* FAB — always bottom right */}
      <button
        onClick={() => setOpen(true)}
        className="tll-on-dark fixed bottom-5 right-4 z-40 flex items-center justify-center transition-all active:scale-95"
        style={{
          width: '58px',
          height: '58px',
          borderRadius: '18px',
          background: count > 0
            ? `linear-gradient(145deg, color-mix(in srgb, #a6e22e 80%, #fff), #a6e22e 45%, color-mix(in srgb, #a6e22e 72%, #000))`
            : 'rgba(22,22,22,0.95)',
          color: count > 0 ? '#0d0d0d' : '#a6e22e',
          border: count > 0 ? 'none' : `1px solid rgba(${AR},0.4)`,
          boxShadow: count > 0
            ? `0 0 20px rgba(${AR},0.45), 0 4px 16px rgba(0,0,0,0.5)`
            : `0 4px 16px rgba(0,0,0,0.5)`,
        }}
        aria-label="My Stack"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        {/* count badge */}
        {count > 0 && !open && (
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
            style={{ background: '#0d0d0d', color: '#a6e22e', border: '1.5px solid #a6e22e' }}
          >
            {count}
          </span>
        )}
        {open
          ? <span className="text-xl leading-none">×</span>
          : <span className="text-xl leading-none">🧪</span>}
      </button>
    </>
  )
}
