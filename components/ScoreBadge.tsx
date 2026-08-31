'use client'

import { useEffect, useRef, useState } from 'react'

export function scoreColor(score: number): string {
  if (score >= 70) return '#c8e86a'
  if (score >= 50) return '#e8a020'
  return '#e05a2b'
}

const SIZES = {
  sm: { px: 48, r: 18, stroke: 4, text: '10px' },
  md: { px: 64, r: 24, stroke: 5, text: '13px' },
  lg: { px: 110, r: 42, stroke: 7, text: '22px' },
}

export default function ScoreBadge({
  score,
  size = 'md',
}: {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const { px, r, stroke, text } = SIZES[size]
  const cx = px / 2
  const circ = 2 * Math.PI * r

  // Initial state is the FINAL value so the server-rendered HTML (and any
  // no-JS / crawler view) shows the real score rather than "0". The count-up
  // animation still runs after hydration: the effect rewinds to 0 and eases
  // back up to the target.
  const [dashFilled, setDashFilled] = useState(() => (score == null ? 0 : circ * (score / 100)))
  const [displayNum, setDisplayNum] = useState(() => score ?? 0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (score == null) return

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    if (reduced) {
      setDashFilled(circ * (score / 100))
      setDisplayNum(score)
      return
    }

    const target = circ * (score / 100)
    const start = performance.now()
    const dur = 1100
    setDashFilled(0)
    setDisplayNum(0)

    function tick(now: number) {
      const p = Math.min((now - start) / dur, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setDashFilled(target * eased)
      setDisplayNum(Math.round(score! * eased))
      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick)
      } else {
        setDashFilled(target)
        setDisplayNum(score!)
      }
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [score, circ])

  if (score == null) {
    return (
      <div
        className="shrink-0 flex items-center justify-center rounded-full border-2 border-lab-border"
        style={{ width: px, height: px, fontSize: text, color: '#4b5563' }}
      >
        –
      </div>
    )
  }

  const color = scoreColor(score)

  return (
    <div className="shrink-0 relative" style={{ width: px, height: px }}>
      <svg
        width={px}
        height={px}
        viewBox={`0 0 ${px} ${px}`}
        className="relative z-10"
        style={{ transform: 'rotate(-90deg)' }}
      >
        {/* track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth={stroke}
        />
        {/* animated fill */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dashFilled} ${circ - dashFilled}`}
          strokeDashoffset={0}
          
        />
      </svg>
      {/* number overlay — not rotated */}
      <div
        className="absolute inset-0 flex items-center justify-center z-20"
        style={{
          fontFamily: 'var(--font-anton), Impact, "Arial Narrow Bold", sans-serif',
          fontSize: text,
          color,
          WebkitTextStroke: '0.6px rgba(0,0,0,0.55)',
          textShadow: '0 1px 2px rgba(0,0,0,0.85)',
        } as React.CSSProperties}
      >
        {displayNum}
      </div>
    </div>
  )
}
