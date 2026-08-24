'use client'

import { useState } from 'react'

// Server-renderable product image. Uses the real `image_url` when the catalogue
// has one; otherwise an honest placeholder (never an invented image URL).
// Plain <img> rather than next/image: product images live on arbitrary retailer
// hosts that aren't in the next.config remotePatterns allowlist.
export default function ProductImage({
  src,
  alt,
  size = 96,
  className = '',
}: {
  src: string | null | undefined
  alt: string
  size?: number
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const show = Boolean(src) && !failed

  if (show) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src!}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`rounded-2xl object-contain shrink-0 ${className}`}
        style={{ width: size, height: size, background: '#2a2a2e' }}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${alt} — no product image available`}
      title="No product image available"
      className={`rounded-2xl border border-lab-border flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)), background: '#2a2a2e' }}
    >
      <span aria-hidden="true">🧪</span>
    </div>
  )
}
