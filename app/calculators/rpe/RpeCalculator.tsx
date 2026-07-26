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

// %1RM for an all-out n-rep max (a set taken to RPE 10). This is the standard
// Reactive Training Systems (RTS) rep-max curve. The full RPE chart is built from
// this single column: a set of `reps` at a given RPE equals a max set of
// `reps + reps-in-reserve` reps, because RIR = 10 - RPE.
const MAX_PCT: Record<number, number> = {
  1: 100.0,
  2: 95.5,
  3: 92.2,
  4: 89.2,
  5: 86.3,
  6: 83.7,
  7: 81.1,
  8: 78.6,
  9: 76.2,
  10: 73.9,
  11: 70.7,
  12: 68.0,
  13: 65.3,
  14: 62.6,
  15: 59.9,
}

const MIN_REPS = 1
const MAX_REPS = 15

// %1RM for `reps` performed at `rpe`. Converts to effective (max-rep-equivalent)
// reps via reps-in-reserve, then linearly interpolates the RTS curve for the
// half-rep steps that half-point RPEs produce. Clamped to the table range.
function pctOf(reps: number, rpe: number): number {
  const rir = 10 - rpe
  let eff = reps + rir
  if (eff < MIN_REPS) eff = MIN_REPS
  if (eff > MAX_REPS) eff = MAX_REPS
  const lo = Math.floor(eff)
  const hi = Math.ceil(eff)
  if (lo === hi) return MAX_PCT[lo]
  const frac = eff - lo
  return MAX_PCT[lo] + (MAX_PCT[hi] - MAX_PCT[lo]) * frac
}

// Round a prescribed load to the nearest sensible barbell increment.
function roundLoad(w: number, unit: Unit): number {
  const step = unit === 'kg' ? 2.5 : 5
  return Math.round(w / step) * step
}

// RPE 6 to 10 in half steps — the range lifters actually rate work sets in.
const RPE_OPTIONS = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]
const REP_OPTIONS = Array.from({ length: MAX_REPS }, (_, i) => i + 1)

function rirLabel(rpe: number): string {
  const rir = 10 - rpe
  if (rir <= 0) return 'nothing left — a true max'
  if (rir === 0.5) return 'maybe half a rep left'
  if (rir === 1) return '1 rep left in the tank'
  return `${rir} reps left in the tank`
}

export default function RpeCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')

  // Part 1 — rate the set you just did
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState(5)
  const [rpe, setRpe] = useState(8)

  // Part 2 — prescribe the next set
  const [targetReps, setTargetReps] = useState(5)
  const [targetRpe, setTargetRpe] = useState(8)

  const e1rm = useMemo(() => {
    const w = num(weight)
    if (w <= 0) return null
    const pct = pctOf(reps, rpe)
    return w / (pct / 100)
  }, [weight, reps, rpe])

  const prescription = useMemo(() => {
    if (!e1rm) return null
    const pct = pctOf(targetReps, targetRpe)
    const raw = e1rm * (pct / 100)
    return {
      pct,
      load: roundLoad(raw, unit),
    }
  }, [e1rm, targetReps, targetRpe, unit])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* unit */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setUnit(u)}
              className="text-[11px] font-black uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
              style={unit === u
                ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                : { borderColor: '#262626', color: '#a3a3a3' }}
            >
              {u === 'kg' ? 'Kilograms' : 'Pounds'}
            </button>
          ))}
        </div>

        {/* Part 1 — rate your set */}
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-3">
          1. Rate the set you did
        </p>

        <label className="block mb-4">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Weight lifted
          </span>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'kg' ? 'e.g. 100' : 'e.g. 225'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => track('calculator_rpe', { unit, reps, rpe })}
              className={inputCls}
            />
            <span className="text-sm font-black uppercase tracking-widest text-lab-muted pr-1">{unit}</span>
          </div>
        </label>

        <div className="grid grid-cols-2 gap-3 mb-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Reps done
            </span>
            <select
              value={reps}
              onChange={(e) => setReps(Number(e.target.value))}
              className={inputCls + ' appearance-none'}
            >
              {REP_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              RPE
            </span>
            <select
              value={rpe}
              onChange={(e) => setRpe(Number(e.target.value))}
              className={inputCls + ' appearance-none'}
            >
              {RPE_OPTIONS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-[11px] text-lab-muted mb-6">
          RPE {rpe} — {rirLabel(rpe)}.
        </p>

        {e1rm ? (
          <>
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-sm text-white/90">Estimated 1-rep max</p>
                <p className="text-3xl font-black text-lab-lime tabular-nums whitespace-nowrap">
                  {roundLoad(e1rm, unit)}{unit}
                </p>
              </div>
              <p className="text-[11px] text-lab-muted mt-2 leading-snug">
                {reps} reps at RPE {rpe} sits at about {pctOf(reps, rpe).toFixed(1)}% of your max, so
                that set points to a 1RM near {roundLoad(e1rm, unit)}{unit}.
              </p>
            </div>

            {/* Part 2 — prescribe next set */}
            <div className="mt-6">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-3">
                2. What to load next time
              </p>
              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                    Target reps
                  </span>
                  <select
                    value={targetReps}
                    onChange={(e) => setTargetReps(Number(e.target.value))}
                    className={inputCls + ' appearance-none'}
                  >
                    {REP_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                    Target RPE
                  </span>
                  <select
                    value={targetRpe}
                    onChange={(e) => setTargetRpe(Number(e.target.value))}
                    className={inputCls + ' appearance-none'}
                  >
                    {RPE_OPTIONS.map((r) => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </label>
              </div>

              {prescription && (
                <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <p className="text-sm text-white/90">
                      Load for {targetReps} reps @ RPE {targetRpe}
                    </p>
                    <p className="text-2xl font-black text-lab-lime tabular-nums whitespace-nowrap">
                      {prescription.load}{unit}
                    </p>
                  </div>
                  <p className="text-[11px] text-lab-muted mt-2 leading-snug">
                    That is about {prescription.pct.toFixed(1)}% of your estimated max — you should
                    finish with {rirLabel(targetRpe)}. Rounded to the nearest {unit === 'kg' ? '2.5kg' : '5lb'}.
                  </p>
                </div>
              )}
            </div>

            {/* funnel — strength traffic to the tools + supplements that move the number */}
            <div className="grid grid-cols-2 gap-2 mt-6">
              <Link
                href="/calculators/1rm"
                onClick={() => track('calculator_cta', { tab: 'rpe', target: '1rm' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                1RM calculator
              </Link>
              <Link
                href="/best/creatine"
                onClick={() => track('calculator_cta', { tab: 'rpe', target: 'creatine' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Best creatine 2026
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter the weight, reps and RPE of a working set — we&apos;ll estimate your 1-rep max and
            tell you exactly what to load for your next set.
          </p>
        )}
      </div>
    </div>
  )
}
