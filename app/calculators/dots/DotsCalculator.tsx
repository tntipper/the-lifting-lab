'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'
type Sex = 'male' | 'female'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function toKg(weight: number, unit: Unit): number {
  return unit === 'kg' ? weight : weight * 0.453592
}

// Official DOTS coefficients (the IPF-adopted successor to Wilks). Denominator is a
// 4th-degree polynomial in bodyweight (kg); score = total(kg) * 500 / denominator.
// Same score scale for both sexes, which is the whole point of DOTS.
const DOTS: Record<Sex, [number, number, number, number, number]> = {
  // [BW^4, BW^3, BW^2, BW^1, BW^0]
  male: [-0.000001093, 0.0007391293, -0.1918759221, 24.0900756, -307.75076],
  female: [-0.0000010706, 0.0005158568, -0.1126655495, 13.6175032, -57.96288],
}

function dotsScore(totalKg: number, bwKg: number, sex: Sex): number {
  const [a, b, c, d, e] = DOTS[sex]
  const denom = a * bwKg ** 4 + b * bwKg ** 3 + c * bwKg ** 2 + d * bwKg + e
  if (denom <= 0) return 0
  return (totalKg * 500) / denom
}

// A rough, honest interpretation band — not an official standard. Framed that way in
// the copy. Elite competitive lifters generally sit past ~400.
const LEVELS: { min: number; label: string; blurb: string }[] = [
  { min: 400, label: 'Elite', blurb: 'Competitive, world-class territory. Relative strength most lifters never reach.' },
  { min: 300, label: 'Advanced', blurb: 'Years of consistent, structured training. Strong at any gym.' },
  { min: 200, label: 'Intermediate', blurb: 'Solid, well past novice. The dose of training now matters more than the programme.' },
  { min: 0, label: 'Beginner', blurb: 'Early days — this is where progress is fastest. Eat, sleep, add weight to the bar.' },
]

function levelFor(score: number) {
  return LEVELS.find((l) => score >= l.min) ?? LEVELS[LEVELS.length - 1]
}

export default function DotsCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [sex, setSex] = useState<Sex>('male')
  const [bodyweight, setBodyweight] = useState('')
  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const result = useMemo(() => {
    const bwKg = toKg(num(bodyweight), unit)
    const totalDisplay = num(squat) + num(bench) + num(deadlift)
    const totalKg = toKg(totalDisplay, unit)
    if (bwKg <= 0 || totalKg <= 0) return null
    const score = dotsScore(totalKg, bwKg, sex)
    if (score <= 0) return null
    return {
      score: Math.round(score * 100) / 100,
      totalDisplay: Math.round(totalDisplay * 2) / 2,
      level: levelFor(score),
    }
  }, [bodyweight, squat, bench, deadlift, unit, sex])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* sex */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['male', 'female'] as Sex[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSex(s)}
              className="text-[11px] font-black uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
              style={sex === s
                ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                : { borderColor: '#262626', color: '#a3a3a3' }}
            >
              {s === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>

        {/* bodyweight + unit */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end mb-5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Bodyweight
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'kg' ? 'e.g. 82' : 'e.g. 180'}
              value={bodyweight}
              onChange={(e) => setBodyweight(e.target.value)}
              className={inputCls}
            />
          </label>
          <div className="flex rounded-lg overflow-hidden border border-lab-border">
            {(['kg', 'lb'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className="px-4 py-2.5 text-[11px] font-black uppercase tracking-widest transition-colors"
                style={unit === u ? { background: '#a6e22e', color: '#000' } : { color: '#a3a3a3' }}
              >
                {u}
              </button>
            ))}
          </div>
        </div>

        {/* the three lifts */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {([
            ['Squat', squat, setSquat],
            ['Bench', bench, setBench],
            ['Deadlift', deadlift, setDeadlift],
          ] as const).map(([label, val, set]) => (
            <label key={label} className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                {label}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="0"
                value={val}
                onChange={(e) => set(e.target.value)}
                onBlur={() => track('calculator_dots', { unit, sex })}
                className={inputCls}
              />
            </label>
          ))}
        </div>

        {result ? (
          <>
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Your DOTS score
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {result.score}
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-3">
                From a {result.totalDisplay} {unit} total at {num(bodyweight)} {unit} bodyweight. DOTS
                normalises your total against your bodyweight so lifters of any size — and either sex —
                sit on one comparable scale.
              </p>
              <div className="mt-4 pt-3 border-t border-lab-border flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-white/90">Rough strength level</p>
                  <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">{result.level.blurb}</p>
                </div>
                <p className="text-lab-lime font-black uppercase tracking-wide whitespace-nowrap">
                  {result.level.label}
                </p>
              </div>
            </div>

            {/* funnel — strength traffic to the supplements that actually move it */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/products?category=creatine"
                onClick={() => track('calculator_cta', { tab: 'dots', target: 'creatine' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Browse creatine
              </Link>
              <Link
                href="/products?category=pre-workout"
                onClick={() => track('calculator_cta', { tab: 'dots', target: 'pre-workout' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Browse pre-workout
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your bodyweight and your best squat, bench and deadlift to score your total.
          </p>
        )}
      </div>
    </div>
  )
}
