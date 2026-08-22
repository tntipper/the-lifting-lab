// Server-renderable product image. Uses the real `image_url` when the catalogue
// has one; otherwise an honest placeholder (never an invented image URL).
// Plain <img> rather than next/image: product images live on arbitrary retailer
// hosts that aren't in the next.config remotePatterns allowlist.
export default function ProductImage({
  src,
  alt,
  size = 64,
  className = '',
}: {
  src: string | null | undefined
  alt: string
  size?: number
  className?: string
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={`rounded-xl object-contain bg-white/95 shrink-0 ${className}`}
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      role="img"
      aria-label={`${alt} — no product image available`}
      title="No product image available"
      className={`rounded-xl bg-lab-panel-2 border border-lab-border flex items-center justify-center shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.38)) }}
    >
      <span aria-hidden="true">🧪</span>
    </div>
  )
}
