'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Round to the nearest 0.5 of the display unit — real plates don't do decimals.
function roundLoad(x: number): number {
  return Math.round(x * 2) / 2
}

// Three established rep-max formulas. We average them because each drifts in a
// different direction; the mean is more robust than any single one, and all are
// only reliable to ~10 reps (why we cap the input at 12).
function epley(w: number, r: number): number {
  return w * (1 + r / 30)
}
function brzycki(w: number, r: number): number {
  return (w * 36) / (37 - r) // denominator stays positive for r <= 12
}
function lombardi(w: number, r: number): number {
  return w * Math.pow(r, 0.1)
}

// Typical %1RM → reps chart (NSCA-style). Used to turn an estimated max into
// day-to-day working loads.
const PCT_TABLE: { pct: number; reps: string }[] = [
  { pct: 100, reps: '1' },
  { pct: 95, reps: '2' },
  { pct: 90, reps: '4' },
  { pct: 85, reps: '6' },
  { pct: 80, reps: '8' },
  { pct: 75, reps: '10' },
  { pct: 70, reps: '12' },
  { pct: 65, reps: '15' },
]

export default function Calculator1RM() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('5')

  const result = useMemo(() => {
    const w = num(weight)
    const r = Math.min(Math.max(Math.round(num(reps)), 1), 12)
    if (w <= 0 || r <= 0) return null
    // A true single is just the weight — no estimate needed or wanted.
    const oneRm = r === 1 ? w : (epley(w, r) + brzycki(w, r) + lombardi(w, r)) / 3
    return {
      oneRm: roundLoad(oneRm),
      reps: r,
      table: PCT_TABLE.map((row) => ({
        ...row,
        load: roundLoad((oneRm * row.pct) / 100),
      })),
    }
  }, [weight, reps])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* weight + unit */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end mb-5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Weight lifted
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'kg' ? 'e.g. 100' : 'e.g. 225'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
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

        {/* reps */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Reps performed (1–12)
          </span>
          <input
            type="number"
            inputMode="numeric"
            min="1"
            max="12"
            placeholder="e.g. 5"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            onBlur={() => track('calculator_1rm', { unit, reps: Math.round(num(reps)) })}
            className={inputCls}
          />
        </label>

        {result ? (
          <>
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Estimated one-rep max
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {result.oneRm}
                <span className="text-xl text-white/70 ml-1">{unit}</span>
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-3">
                {result.reps === 1
                  ? 'A clean single is your true max — no estimate needed.'
                  : `Averaged across the Epley, Brzycki and Lombardi formulas. Estimates are most accurate at 5 reps or fewer, so treat this as a close guide, not a guarantee.`}
              </p>
            </div>

            {/* percentage-based training loads */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Your training loads
              </p>
              <div className="divide-y divide-lab-border">
                {result.table.map((row) => (
                  <div key={row.pct} className="flex items-baseline justify-between gap-4 py-2">
                    <div className="min-w-0">
                      <span className="text-sm text-white/90 tabular-nums">{row.pct}%</span>
                      <span className="text-[11px] text-lab-muted ml-2">~{row.reps} reps</span>
                    </div>
                    <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">
                      {row.load} {unit}
                    </p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-lab-muted/80 leading-snug mt-3">
                Use these to programme your working sets — strength work sits at 85%+, hypertrophy
                around 70–80%.
              </p>
            </div>

            {/* funnel — strength traffic to the supplements that actually move it */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/products?category=creatine"
                onClick={() => track('calculator_cta', { tab: '1rm', target: 'creatine' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Browse creatine
              </Link>
              <Link
                href="/products?category=pre-workout"
                onClick={() => track('calculator_cta', { tab: '1rm', target: 'pre-workout' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Browse pre-workout
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter the weight and how many reps you hit to estimate your max.
          </p>
        )}
      </div>
    </div>
  )
}
