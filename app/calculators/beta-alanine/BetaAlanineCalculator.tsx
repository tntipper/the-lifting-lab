'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'
type Form = 'standard' | 'sr'

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

// Round to the nearest 0.5g — the granularity a kitchen scoop can realistically hit.
function half(n: number): number {
  return Math.round(n * 2) / 2
}

// One decimal, for the per-dose figure where 0.5g steps are too coarse.
function tenth(n: number): number {
  return Math.round(n * 10) / 10
}

export default function BetaAlanineCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [weight, setWeight] = useState('')
  const [form, setForm] = useState<Form>('standard')
  const [tub, setTub] = useState(300) // grams

  const weightKg = toKg(num(weight), unit)

  const result = useMemo(() => {
    if (weightKg <= 0) return null

    // ISSN position stand: effective dose 3.2–6.4 g/day, scaled roughly by bodyweight
    // (smaller people floor at 3.2g, larger cap at 6.4g — carnosine saturation, not size, is the ceiling).
    const raw = weightKg * 0.065
    const daily = half(Math.min(6.4, Math.max(3.2, raw)))

    // Split to keep each dose small: standard powder tingles above ~1.6g, sustained-release
    // formulas blunt that so you can take fewer, larger doses.
    const cap = form === 'standard' ? 1.6 : 3.0
    const doses = Math.max(1, Math.ceil(daily / cap))
    const perDose = tenth(daily / doses)

    // Muscle carnosine saturates over weeks regardless of form — beta-alanine has no acute effect.
    const tubDays = Math.floor(tub / daily)

    return { daily, doses, perDose, tubDays }
  }, [weightKg, form, tub])

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
              onBlur={() => track('calculator_beta_alanine', { unit, form })}
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

        {/* form */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Your beta-alanine
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 'standard' as Form, label: 'Standard powder', sub: 'Split to ease tingles' },
              { id: 'sr' as Form, label: 'Sustained-release', sub: 'Fewer, larger doses' },
            ]).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setForm(f.id); track('calculator_beta_alanine_form', { form: f.id }) }}
                className="text-left px-4 py-3 rounded-lg border transition-colors"
                style={form === f.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <span
                  className="block text-[11px] font-black uppercase tracking-widest"
                  style={{ color: form === f.id ? '#a6e22e' : '#e5e5e5' }}
                >
                  {f.label}
                </span>
                <span className="block text-[11px] text-lab-muted mt-0.5">{f.sub}</span>
              </button>
            ))}
          </div>
        </label>

        {result ? (
          <>
            {/* headline dose */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Your daily dose
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {result.daily}<span className="text-xl text-white/70 ml-1">g / day</span>
              </p>

              <p className="text-xs text-lab-muted leading-snug mt-3">
                Split into <span className="text-white/80">{result.doses} &times; ~{result.perDose}g</span>{' '}
                across the day.{' '}
                {form === 'standard'
                  ? 'Keeping each dose small blunts the harmless skin-tingling (paraesthesia) beta-alanine is famous for.'
                  : 'Sustained-release beta-alanine releases slowly, so you can take bigger doses with barely any tingle.'}
              </p>

              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white/90">Full muscle saturation</p>
                    <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                      No acute effect — it builds up. Timing does not matter, only taking it daily.
                    </p>
                  </div>
                  <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">2–4 weeks</p>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-white/90">Where it helps</p>
                  <p className="text-lab-lime font-black tabular-nums whitespace-nowrap text-right">High-rep sets<br className="sm:hidden" /> 1–4 min</p>
                </div>
              </div>
            </div>

            {/* tub longevity */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                  Tub size — see how long it lasts
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {[200, 300, 500].map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setTub(g)}
                      className="text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
                      style={tub === g
                        ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                        : { borderColor: '#262626', color: '#a3a3a3' }}
                    >
                      {`${g} g`}
                    </button>
                  ))}
                </div>
              </label>
              <div className="mt-4 flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm text-white/90">Lasts roughly</p>
                  <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                    At {result.daily}g/day. Standalone powder is far cheaper per gram than the beta-alanine
                    hidden in a scoop of pre-workout.
                  </p>
                </div>
                <p className="text-2xl font-black text-lab-lime tabular-nums whitespace-nowrap">{result.tubDays} days</p>
              </div>
            </div>

            {/* funnel */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/best/pre-workout"
                onClick={() => track('calculator_cta', { tab: 'beta-alanine', target: 'best-pre-workout' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Best pre-workout 2026
              </Link>
              <Link
                href="/ingredients/beta-alanine"
                onClick={() => track('calculator_cta', { tab: 'beta-alanine', target: 'ingredient' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Beta-alanine explained
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your bodyweight and pick your form — we&apos;ll show your daily dose, how to split it to
            control the tingles, and how long a tub lasts.
          </p>
        )}
      </div>
    </div>
  )
}
