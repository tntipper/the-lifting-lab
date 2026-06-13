'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type FeaturedBrand = {
  brand_name: string
  tagline: string | null
  cta_text: string | null
  cta_url: string
}

export default function FeaturedSlot() {
  const [brand, setBrand] = useState<FeaturedBrand | null | 'loading'>('loading')

  useEffect(() => {
    fetch('/api/featured-brand')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBrand(d))
      .catch(() => setBrand(null))
  }, [])

  // show nothing while loading to avoid layout shift
  if (brand === 'loading') return null

  // no active featured brand — show placeholder
  if (!brand) {
    return (
      <Link
        href="/contact"
        className="block w-full rounded-2xl border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4 text-center hover:bg-yellow-500/10 transition-colors"
      >
        <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-1">
          ⭐ Featured Placement
        </div>
        <div className="text-sm font-black uppercase text-white leading-tight">Your Brand Here</div>
        <div className="text-[11px] text-gray-400 mt-1">
          Reading this? So are your customers.
          <br />
          Get in touch to feature your brand.
        </div>
        <div className="mt-3 inline-block bg-yellow-500 text-black text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
          Contact Us ›
        </div>
      </Link>
    )
  }

  // live featured brand
  return (
    <a
      href={brand.cta_url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="block w-full rounded-2xl border border-yellow-500/60 bg-yellow-500/8 p-4 text-center hover:bg-yellow-500/15 transition-colors"
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-1">
        ⭐ Featured Brand
      </div>
      <div className="text-sm font-black uppercase text-white leading-tight">{brand.brand_name}</div>
      {brand.tagline && (
        <div className="text-[11px] text-gray-400 mt-1">{brand.tagline}</div>
      )}
      <div className="mt-3 inline-block bg-yellow-500 text-black text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
        {brand.cta_text || 'Shop Now'} ›
      </div>
    </a>
  )
}
