'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useEffect, useState } from 'react'

type FeaturedBrand = {
  brand_name: string
  tagline: string | null
  cta_text: string | null
  cta_url: string
  image_url: string | null
}

const AR = '166,226,46'

function SlotCard({ href, external, children }: { href: string; external?: boolean; children: React.ReactNode }) {
  const cls = 'lab-card beam block p-6 text-center hover:opacity-95 transition-opacity'
  if (external) {
    return <a href={href} target="_blank" rel="noopener noreferrer nofollow sponsored" className={cls}>{children}</a>
  }
  return <Link href={href} className={cls}>{children}</Link>
}

function SlotInner({ name, tagline, cta }: { name: string; tagline?: string; cta: string }) {
  return (
    <>
      {/* eyebrow with glowing lime dot */}
      <div className="flex items-center justify-center gap-2 mb-3">
        <span
          className="inline-block w-[5px] h-[5px] rounded-full"
          style={{ background: `rgba(${AR},1)`, boxShadow: `0 0 6px rgba(${AR},0.9)` }}
        />
        <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-lab-muted">
          Featured placement
        </span>
      </div>

      {/* brand name */}
      <h4
        className="uppercase text-white text-xl mb-2"
        style={{ fontFamily: 'var(--font-anton), Impact, sans-serif', transform: 'skewX(-5deg)', letterSpacing: '0.5px' }}
      >
        {name}
      </h4>

      {tagline && (
        <p className="text-[13px] text-lab-muted max-w-xs mx-auto mb-4 leading-relaxed">{tagline}</p>
      )}

      {/* ghost CTA */}
      <span
        className="inline-block text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all"
        style={{
          color: `rgba(${AR},1)`,
          border: `1px solid rgba(${AR},0.6)`,
          boxShadow: `0 0 8px rgba(${AR},0.2), inset 0 0 8px rgba(${AR},0.05)`,
        }}
      >
        {cta}
      </span>
    </>
  )
}

export default function FeaturedSlot() {
  const [brand, setBrand] = useState<FeaturedBrand | null | 'loading'>('loading')

  useEffect(() => {
    fetch('/api/featured-brand')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBrand(d))
      .catch(() => setBrand(null))
  }, [])

  if (brand === 'loading') return null

  // No paid featured brand -> hide the slot entirely (P2-6). Previously this
  // rendered a "Your Brand Here" house ad; per product decision the empty slot is
  // now suppressed so the homepage doesn't surface an empty/placeholder promo.
  if (!brand) return null

  return (
    <SlotCard href={brand.cta_url} external>
      {brand.image_url && (
        <div className="relative w-full rounded-xl mb-4 overflow-hidden" style={{ height: '180px' }}>
          <Image
            src={brand.image_url}
            alt={`${brand.brand_name} featured promotion`}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 600px"
          />
        </div>
      )}
      <SlotInner
        name={brand.brand_name}
        tagline={brand.tagline ?? undefined}
        cta={`${brand.cta_text || 'Shop Now'} ›`}
      />
    </SlotCard>
  )
}
