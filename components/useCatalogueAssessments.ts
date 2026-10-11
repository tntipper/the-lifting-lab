'use client'

import { useEffect, useState } from 'react'
import { isProductId, MAX_SHARE_PRODUCTS, type ShareProduct } from '@/lib/share-products'

export function useCatalogueAssessments(ids: string[], enabled: boolean) {
  const key = [...new Set(ids)].sort().join(',')
  const [result, setResult] = useState<{ key: string; products: ShareProduct[]; error: boolean } | null>(null)
  useEffect(() => {
    setResult(null)
    if (!enabled || !key) return
    let cancelled = false
    const controller = new AbortController()
    const requested = key.split(',')
    async function load() {
      if (requested.length > 100 || requested.some(id => !isProductId(id))) throw new Error('Invalid IDs')
      const batches = Array.from({ length: Math.ceil(requested.length / MAX_SHARE_PRODUCTS) }, (_, i) => requested.slice(i * MAX_SHARE_PRODUCTS, (i + 1) * MAX_SHARE_PRODUCTS))
      const products = (await Promise.all(batches.map(async batch => {
        const response = await fetch(`/api/stack/assessments?${new URLSearchParams({ ids: batch.join(',') })}`, {
          cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        })
        if (!response.ok) throw new Error('Catalogue unavailable')
        const data = await response.json()
        if (!Array.isArray(data.products) || data.products.length !== batch.length || data.products.some((p: ShareProduct) =>
          !p || !batch.includes(p.id) || ['brand', 'name', 'category'].some(k => typeof p[k as keyof ShareProduct] !== 'string')
          || !(p.score === null || (typeof p.score === 'number' && Number.isFinite(p.score) && p.score >= 0 && p.score <= 100)),
        ) || new Set(data.products.map((p: ShareProduct) => p.id)).size !== batch.length) throw new Error('Invalid catalogue response')
        return data.products as ShareProduct[]
      }))).flat()
      if (!cancelled) setResult({ key, products, error: false })
    }
    void load().catch(() => { if (!cancelled) setResult({ key, products: [], error: true }) })
    return () => { cancelled = true; controller.abort() }
  }, [key, enabled])
  // Never display a previous selection's data while its replacement resolves.
  const current = enabled && result?.key === key ? result : null
  return { products: current?.products ?? [], loading: enabled && !!key && !current, error: current?.error ?? false }
}
