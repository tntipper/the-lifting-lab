'use client'

// Compact 5-star display / input. Read-only by default; pass onChange to make
// it an input (used in the review form). Lime fill matches the brand accent.
export default function StarRating({
  value,
  onChange,
  size = 16,
}: {
  value: number
  onChange?: (v: number) => void
  size?: number
}) {
  const interactive = typeof onChange === 'function'
  return (
    <span className="inline-flex items-center gap-0.5" role={interactive ? 'radiogroup' : 'img'} aria-label={`${value} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= Math.round(value)
        const star = (
          <span style={{ fontSize: size, lineHeight: 1, color: filled ? '#a6e22e' : '#3a3a3a' }}>★</span>
        )
        if (!interactive) return <span key={n}>{star}</span>
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange!(n)}
            className="leading-none transition-transform hover:scale-110"
            aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}
            aria-pressed={n === value}
          >
            {star}
          </button>
        )
      })}
    </span>
  )
}
