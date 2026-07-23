'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'
type Approach = 'load' | 'steady'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function toKg(weight: number, unit: Unit): number {
  return unit === 'kg' ? weight : weight * 0.453592
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Round to the nearest 0.5g — the granularity a kitchen scoop can actually hit.
function half(n: number): number {
  return Math.round(n * 2) / 2
}

// Maintenance is essentially flat in the evidence (3–5g/day regardless of size),
// but a large lifter sits at the top of that band, so we nudge toward 5g past ~90kg.
function maintenanceDose(weightKg: number): number {
  if (weightKg <= 0) return 5
  return weightKg >= 90 ? 5 : weightKg >= 70 ? 4 : 3
}

export default function CreatineCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [weight, setWeight] = useState('')
  const [approach, setApproach] = useState<Approach>('load')
  const [tub, setTub] = useState(500) // grams

  const weightKg = toKg(num(weight), unit)

  const result = useMemo(() => {
    if (weightKg <= 0) return null

    // ISSN protocol: loading ~0.3 g/kg/day for 5–7 days, split into 4 doses.
    const loadDaily = half(weightKg * 0.3)
    const perDose = half(loadDaily / 4)
    const maint = maintenanceDose(weightKg)

    const dailyDose = approach === 'load' ? loadDaily : maint
    const daysToSaturation = approach === 'load' ? '5–7 days' : '3–4 weeks'

    // Tub longevity, priced against the phase the user picked. A loading phase burns
    // ~6 days at the high daily dose, then drops to maintenance for the rest of the tub.
    let tubDays: number
    if (approach === 'load') {
      const loadingGrams = loadDaily * 6
      if (tub <= loadingGrams) {
        tubDays = Math.floor(tub / loadDaily)
      } else {
        tubDays = 6 + Math.floor((tub - loadingGrams) / maint)
      }
    } else {
      tubDays = Math.floor(tub / maint)
    }

    return {
      loadDaily,
      perDose,
      maint,
      dailyDose,
      daysToSaturation,
      tubDays,
      loadingGramsTotal: half(loadDaily * 6),
    }
  }, [weightKg, approach, tub])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* bodyweight */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end mb-6">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Your bodyweight
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'kg' ? 'e.g. 82' : 'e.g. 180'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => track('calculator_creatine', { unit, approach })}
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

        {/* approach */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Your approach
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'load' as Approach, label: 'Loading phase', sub: 'Saturate in a week' },
              { id: 'steady' as Approach, label: 'No loading', sub: 'Simpler, slower' },
            ]).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => { setApproach(a.id); track('calculator_creatine_approach', { approach: a.id }) }}
                className="text-left px-4 py-3 rounded-lg border transition-colors"
                style={approach === a.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <span
                  className="block text-[11px] font-black uppercase tracking-widest"
                  style={{ color: approach === a.id ? '#a6e22e' : '#e5e5e5' }}
                >
                  {a.label}
                </span>
                <span className="block text-[11px] text-lab-muted mt-0.5">{a.sub}</span>
              </button>
            ))}
          </div>
        </label>

        {result ? (
          <>
            {/* headline dose */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                {approach === 'load' ? 'Loading dose — days 1 to 6' : 'Your daily dose'}
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {result.dailyDose}<span className="text-xl text-white/70 ml-1">g / day</span>
              </p>

              {approach === 'load' ? (
                <p className="text-xs text-lab-muted leading-snug mt-3">
                  Split into <span className="text-white/80">4 &times; {result.perDose}g</span> across
                  the day to go easy on your stomach. After 5 to 7 days, drop to a{' '}
                  <span className="text-white/80">{result.maint}g/day</span> maintenance dose for good.
                </p>
              ) : (
                <p className="text-xs text-lab-muted leading-snug mt-3">
                  One flat dose every day, forever — no loading needed. Timing does not matter, so take
                  it whenever you will remember. Bigger lifters sit at the top of the 3 to 5g band.
                </p>
              )}

              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-white/90">Full muscle saturation</p>
                  <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{result.daysToSaturation}</p>
                </div>
                {approach === 'load' && (
                  <div className="flex items-baseline justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm text-white/90">Then maintenance</p>
                      <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">The dose you stay on for good.</p>
                    </div>
                    <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{result.maint}g / day</p>
                  </div>
                )}
              </div>
            </div>

            {/* tub longevity */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                  Tub size — see how long it lasts
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[250, 500, 1000].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTub(g)}
                      className="text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
                      style={tub === g
                        ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                        : { borderColor: '#262626', color: '#a3a3a3' }}
                    >
                      {g === 1000 ? '1 kg' : `${g} g`}
                    </button>
                  ))}
                </div>
              </label>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-white/90">Lasts roughly</p>
                  <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                    {approach === 'load'
                      ? `Loading week uses ~${result.loadingGramsTotal}g, then ${result.maint}g/day after.`
                      : `At a flat ${result.maint}g/day. Why price per gram beats price per tub.`}
                  </p>
                </div>
                <p className="text-2xl font-black text-lab-lime tabular-nums whitespace-nowrap">{result.tubDays} days</p>
              </div>
            </div>

            {/* funnel */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/best/creatine"
                onClick={() => track('calculator_cta', { tab: 'creatine', target: 'best-creatine' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Best creatine 2026
              </Link>
              <Link
                href="/guide/creatine"
                onClick={() => track('calculator_cta', { tab: 'creatine', target: 'guide' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Creatine guide
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your bodyweight and pick an approach — we&apos;ll show your exact dose, how to split it,
            and how fast your muscles saturate.
          </p>
        )}
      </div>
    </div>
  )
}
