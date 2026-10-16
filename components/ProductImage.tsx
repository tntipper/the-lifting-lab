'use client'

import { useState } from 'react'
import Image from 'next/image'

// Unoptimised preserves arbitrary catalogue retailer hosts without a proxy allowlist.
export default function ProductImage({
  src,
  alt,
  size = 96,
  fill = false,
  sizes,
  className = '',
}: {
  src: string | null | undefined
  alt: string
  size?: number
  fill?: boolean
  sizes?: string
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  const show = Boolean(src) && !failed

  if (show) {
    return (
      <Image
        unoptimized
        {...(fill ? { fill: true, sizes: sizes ?? "100vw" } : { width: size, height: size })}
        src={src!}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className={`rounded-lg object-contain object-center shrink-0 ${className}`}
        style={{ width: fill ? '100%' : size, height: fill ? '100%' : size, background: '#ecece4' }}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${alt} — no product image available`}
      title="No product image available"
      className={`rounded-lg border border-lab-border flex items-center justify-center shrink-0 ${className}`}
      style={{ width: fill ? '100%' : size, height: fill ? '100%' : size, position: fill ? 'absolute' : undefined, inset: fill ? 0 : undefined, fontSize: 12, background: '#ecece4' }}
    >
      <span aria-hidden="true" className="px-3 text-center font-mono text-lab-muted">No product image</span>
    </div>
  )
}
