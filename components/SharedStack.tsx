'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import BuyMyStack from './BuyMyStack'
import { readSharedStackQuery, rebuildSharedStack, sharedStackPath } from '@/lib/commerce/stack-share'
import type { StackCartItem } from '@/lib/commerce/stack-cart'

export default function SharedStack({ query }: { query: string }) {
  const [loaded, setLoaded] = useState<{ query: string; items: StackCartItem[]; error: string | null } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const lines = readSharedStackQuery(new URLSearchParams(query))
  const path = lines && sharedStackPath(lines)
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    void fetch(`/api/stack/shared?${path.split('?')[1]}`, { signal: controller.signal, cache: 'no-store' })
      .then(async response => {
        const data = await response.json()
        if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Shared products could not be loaded.')
        const parsed = readSharedStackQuery(new URLSearchParams(query))
        const items = parsed && Array.isArray(data.items) ? rebuildSharedStack(parsed, data.items) : null
        if (!items) throw new Error('The shared stack could not be confirmed.')
        if (!controller.signal.aborted) setLoaded({ query, items, error: null })
      }).catch(error => { if (!controller.signal.aborted) setLoaded({ query, items: [], error: error instanceof Error ? error.message : 'Shared products could not be loaded.' }) })
    return () => controller.abort()
  }, [path, query, attempt])
  const current = loaded?.query === query ? loaded : null
  return <section>
    <h1 className="text-3xl font-bold">Shared stack</h1>
    <p className="mt-3">Quantities are packs to buy, not daily servings. Your saved stack stays separate from this shared selection.</p>
    {!lines ? <p role="alert">Invalid shared stack. Use up to 50 distinct variant IDs with pack quantities from 1 to 99.</p> : <>
      <ul className="my-4">{lines.map(line => <li key={line.variantId}>{current?.items.find(item => item.storeLinkMapping?.shopifyVariantId.replace('gid://shopify/ProductVariant/', '') === line.variantId)?.name || `Variant ${line.variantId}`} — {line.quantity} pack(s)</li>)}</ul>
      {!current && <p role="status">Loading shared products…</p>}
      {current?.error && <p role="alert">{current.error} <button type="button" className="underline" onClick={() => { setLoaded(null); setAttempt(n => n + 1) }}>Retry</button></p>}
      <BuyMyStack items={current?.items || []} ready={Boolean(current && !current.error)} />
      {path && <a className="block my-4 underline" href={path}>Share this stack URL</a>}
    </>}
    <Link href="/stack" className="underline">Open my saved stack</Link>
  </section>
}
