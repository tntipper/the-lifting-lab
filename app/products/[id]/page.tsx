'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import ScoreBadge, { scoreColor } from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { buyLink } from '@/lib/affiliate'
import { track } from '@/lib/gtag'
import type { Nutrient } from '@/lib/products'

type ProductDetail = {
  id: string
  name: string
  brand: string
  category: string
  serving_size: number | null
  serving_unit: string | null
  servings_per_container: number | null
  informed_sport: boolean | null
  score: number | null
  nutrients: Nutrient[]
}

function verdictFlags(p: ProductDetail): { color: string; text: string }[] {
  const flags: { color: string; text: string }[] = []
  const score = p.score

  if (score == null) return flags

  const green = '#a6e22e'
  const yellow = '#f5b342'
  const red = '#ff5c5c'

  if (score >= 90) flags.push({ color: green, text: 'Excellent clinical match — top tier dosing' })
  else if (score >= 70) flags.push({ color: green, text: 'Strong clinical match against reference doses' })
  else if (score >= 50) flags.push({ color: yellow, text: 'Partial clinical match — some doses below optimal' })
  else flags.push({ color: red, text: 'Poor clinical match — significantly underdosed vs reference' })

  if (p.informed_sport) flags.push({ color: green, text: 'Informed Sport certified — batch tested for banned substances' })

  for (const n of p.nutrients) {
    const name = n.nutrient_name.toLowerCase()
    const amt = n.amount

    if (name.includes('caffeine')) {
      if (amt >= 200 && amt <= 400) flags.push({ color: green, text: `Caffeine ${amt}mg — in the clinical sweet spot (200–400mg)` })
      else if (amt > 400) flags.push({ color: red, text: `Caffeine ${amt}mg — above 400mg, potential side effects` })
      else flags.push({ color: yellow, text: `Caffeine ${amt}mg — below optimal range (200–400mg)` })
    }
    if (name.includes('citrulline')) {
      if (amt >= 6000) flags.push({ color: green, text: `Citrulline ${amt}mg — meets or exceeds 6g clinical dose` })
      else flags.push({ color: yellow, text: `Citrulline ${amt}mg — below optimal 6–8g clinical dose` })
    }
    if (name.includes('beta-alanine') || name === 'beta alanine') {
      if (amt >= 3200) flags.push({ color: green, text: `Beta-Alanine ${amt}mg — clinical dose met (3.2g)` })
      else flags.push({ color: yellow, text: `Beta-Alanine ${amt}mg — below optimal 3.2g dose` })
    }
    if (name === 'creatine' || name.includes('creatine monohydrate')) {
      if (amt >= 5000) flags.push({ color: green, text: `Creatine ${amt}mg — full 5g clinical dose` })
      else flags.push({ color: yellow, text: `Creatine ${amt}mg — below optimal 5g dose` })
    }
    if (name === 'protein') {
      if (amt >= 25) flags.push({ color: green, text: `${amt}g protein per serving — strong yield` })
      else flags.push({ color: yellow, text: `${amt}g protein per serving — moderate yield` })
    }
    if (name.includes('vitamin d')) {
      if (amt >= 25) flags.push({ color: green, text: `Vitamin D ${amt}mcg — meets 1000IU+ recommendation` })
      else flags.push({ color: yellow, text: `Vitamin D ${amt}mcg — below optimal dosing` })
    }
    if (name === 'magnesium') {
      if (amt >= 200) flags.push({ color: green, text: `Magnesium ${amt}mg — meaningful dose` })
      else flags.push({ color: yellow, text: `Magnesium ${amt}mg — low dose` })
    }
  }

  return flags
}

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/products/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { setProduct(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [id])

  if (loading) {
    return (
      <div className="min-h-screen bg-lab-bg flex items-center justify-center">
        <p className="text-lab-muted text-sm">Loading…</p>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="min-h-screen bg-lab-bg flex flex-col items-center justify-center gap-4">
        <p className="text-white text-lg font-bold">Product not found</p>
        <Link href="/products" className="text-lab-lime text-sm underline">Back to products</Link>
      </div>
    )
  }

  const flags = verdictFlags(product)
  const color = product.score != null ? scoreColor(product.score) : '#4b5563'

  return (
    <div className="min-h-screen bg-lab-bg text-white pb-32">
      {/* header */}
      <div className="sticky top-0 z-20 bg-lab-bg/95 backdrop-blur border-b border-lab-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-lab-muted hover:text-white text-sm font-bold uppercase tracking-widest"
        >
          ← Back
        </button>
        <span className="text-lab-muted text-xs">|</span>
        <span className="text-lab-muted text-xs uppercase tracking-widest truncate">
          {categoryLabel(product.category)}
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-8 space-y-6">
        {/* hero */}
        <div className="flex flex-col items-center text-center gap-4">
          <ScoreBadge score={product.score} size="lg" />
          <div>
            <p className="text-lab-muted text-xs uppercase tracking-widest">{product.brand}</p>
            <h1 className="text-2xl font-black italic mt-1">{product.name}</h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                {categoryLabel(product.category)}
              </span>
              {product.informed_sport && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-green-900/50 text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">
                  🛡️ IS Certified
                </span>
              )}
            </div>
          </div>
        </div>

        {/* verdict flags */}
        {flags.length > 0 && (
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 space-y-3">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-1">The Verdict</p>
            {flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-lg leading-none mt-0.5" style={{ color: f.color }}>●</span>
                <span className="text-sm text-white/90 leading-snug">{f.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* nutrients */}
        {product.nutrients.length > 0 && (
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-4">Full Label</p>
            <div className="space-y-0">
              {product.nutrients.map((n, i) => (
                <div key={i} className={`flex justify-between py-2.5 text-sm ${i < product.nutrients.length - 1 ? 'border-b border-lab-border' : ''}`}>
                  <span className="text-white/80">{n.nutrient_name}</span>
                  <span className="font-bold text-white">{n.amount}{n.unit}</span>
                </div>
              ))}
            </div>
            {product.servings_per_container && (
              <p className="text-xs text-lab-muted mt-3">
                {product.servings_per_container} servings · {product.serving_size}{product.serving_unit} per serving
              </p>
            )}
          </div>
        )}

        {/* score explanation */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-2">Score Explained</p>
          <p className="text-sm text-white/70 leading-relaxed">
            This product scores <span className="font-bold" style={{ color }}>{product.score ?? '–'}/100</span> against
            our clinical reference spec for {categoryLabel(product.category).toLowerCase()}. Scores
            are based on dose-for-dose comparison against evidence-based targets — not brand reputation or marketing claims.
          </p>
        </div>
      </div>

      {/* sticky buy bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-lab-panel-2 border-t border-lab-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-lab-muted truncate">{product.brand}</p>
            <p className="text-sm font-bold text-white truncate">{product.name}</p>
          </div>
          <a
            href={buyLink(product.brand, product.name)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => track('buy_click', { item_brand: product.brand, item_name: product.name })}
            className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90 shrink-0"
          >
            Buy Now →
          </a>
        </div>
      </div>
    </div>
  )
}
