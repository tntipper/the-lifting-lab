'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Form = 'pure' | 'cm21' | 'cm11'
type Target = 6 | 8

const AR = '166,226,46'

// L-citrulline fraction by weight in each form. Citrulline malate is a bonded
// blend, so only part of the powder is the active L-citrulline you actually want:
//   pure L-citrulline = 100%
//   citrulline malate 2:1 = 2 parts citrulline : 1 part malic acid = ~67%
//   citrulline malate 1:1 = 1 part citrulline : 1 part malic acid = 50%
const FORMS: { id: Form; label: string; sub: string; frac: number }[] = [
  { id: 'pure', label: 'Pure L-citrulline', sub: '100% active', frac: 1 },
  { id: 'cm21', label: 'Citrulline malate 2:1', sub: '~67% active', frac: 2 / 3 },
  { id: 'cm11', label: 'Citrulline malate 1:1', sub: '50% active', frac: 0.5 },
]

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Round to the nearest 0.5g — the granularity a kitchen scoop can realistically hit.
function half(n: number): number {
  return Math.round(n * 2) / 2
}

// One decimal, for the malic-acid figure where 0.5g steps are too coarse.
function tenth(n: number): number {
  return Math.round(n * 10) / 10
}

export default function CitrullineCalculator() {
  const [form, setForm] = useState<Form>('cm21')
  const [target, setTarget] = useState<Target>(6)
  const [tub, setTub] = useState(300) // grams
  // Optional: what your product's label claims per scoop, to reality-check it.
  const [label, setLabel] = useState('')

  const meta = FORMS.find((f) => f.id === form)!

  const result = useMemo(() => {
    // Product powder needed to deliver the effective L-citrulline target.
    const productDose = half(target / meta.frac)
    // The rest of citrulline-malate powder is malic acid, not the active ingredient.
    const malicAcid = tenth(productDose - target)
    // Servings per tub — citrulline is dosed per session, not saturated over weeks,
    // so a "tub lasts N servings" framing is the honest one (unlike creatine/beta-alanine).
    const servings = Math.floor(tub / productDose)

    // Reality-check a labelled product dose: how much ACTUAL L-citrulline it yields.
    const labelled = num(label)
    const labelledLCit = labelled > 0 ? tenth(labelled * meta.frac) : null
    const labelledHitsTarget = labelledLCit !== null && labelledLCit >= target - 0.05

    return { productDose, malicAcid, servings, labelledLCit, labelledHitsTarget, labelled }
  }, [form, target, tub, label, meta.frac])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* form */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Which form is your citrulline?
          </span>
          <div className="grid gap-2">
            {FORMS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => { setForm(f.id); track('calculator_citrulline_form', { form: f.id }) }}
                className="text-left px-4 py-3 rounded-lg border transition-colors flex items-center justify-between gap-3"
                style={form === f.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <span
                  className="block text-[12px] font-black uppercase tracking-widest"
                  style={{ color: form === f.id ? '#a6e22e' : '#e5e5e5' }}
                >
                  {f.label}
                </span>
                <span className="block text-[11px] text-lab-muted whitespace-nowrap">{f.sub}</span>
              </button>
            ))}
          </div>
        </label>

        {/* target */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Effective L-citrulline target
          </span>
          <div className="grid grid-cols-2 gap-2">
            {([
              { id: 6 as Target, label: '6 g', sub: 'Standard dose' },
              { id: 8 as Target, label: '8 g', sub: 'Max pump & endurance' },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setTarget(t.id); track('calculator_citrulline', { form, target: t.id }) }}
                className="text-left px-4 py-3 rounded-lg border transition-colors"
                style={target === t.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <span
                  className="block text-[12px] font-black uppercase tracking-widest"
                  style={{ color: target === t.id ? '#a6e22e' : '#e5e5e5' }}
                >
                  {t.label}
                </span>
                <span className="block text-[11px] text-lab-muted mt-0.5">{t.sub}</span>
              </button>
            ))}
          </div>
        </label>

        {/* headline dose */}
        <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            Powder to weigh out per serving
          </p>
          <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
            {result.productDose}<span className="text-xl text-white/70 ml-1">g</span>
          </p>

          <p className="text-xs text-lab-muted leading-snug mt-3">
            {form === 'pure' ? (
              <>All {result.productDose}g is active L-citrulline — the cleanest, most concentrated form.</>
            ) : (
              <>
                Delivers your <span className="text-white/80">{target}g of actual L-citrulline</span>;
                the other <span className="text-white/80">~{result.malicAcid}g</span> is malic acid, not
                the active ingredient. This is why malate looks &quot;stronger&quot; on the label but is not.
              </>
            )}
          </p>

          <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-white/90">When to take it</p>
                <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                  Acute effect — dose it per session, like caffeine, not daily like creatine.
                </p>
              </div>
              <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">45–60 min pre</p>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-sm text-white/90">Where it helps</p>
              <p className="text-lab-lime font-black tabular-nums whitespace-nowrap text-right">Pumps &amp; reps<br className="sm:hidden" /> to failure</p>
            </div>
          </div>
        </div>

        {/* label reality-check */}
        <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Reality-check your pre-workout
            </span>
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="Citrulline listed per scoop, e.g. 6"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                onBlur={() => track('calculator_citrulline_check', { form })}
                className="w-full bg-lab-panel border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-lab-lime/60 transition-colors"
              />
              <span className="text-xs text-lab-muted whitespace-nowrap">grams on label</span>
            </div>
          </label>
          {result.labelledLCit !== null ? (
            <div className="mt-4 flex items-baseline justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm text-white/90">
                  Actual L-citrulline:{' '}
                  <span className="font-black" style={{ color: result.labelledHitsTarget ? '#a6e22e' : '#f87171' }}>
                    {result.labelledLCit}g
                  </span>
                </p>
                <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                  {form === 'pure'
                    ? 'Pure L-citrulline, so the label figure is the real figure.'
                    : `Your ${result.labelled}g of ${meta.label} is only ~${meta.frac === 0.5 ? '50' : '67'}% citrulline.`}{' '}
                  {result.labelledHitsTarget
                    ? `That clears your ${target}g target.`
                    : `That falls short of the ${target}g target — a common underdose.`}
                </p>
              </div>
              <p
                className="text-2xl font-black tabular-nums whitespace-nowrap"
                style={{ color: result.labelledHitsTarget ? '#a6e22e' : '#f87171' }}
              >
                {result.labelledHitsTarget ? '✓' : '✗'}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-lab-muted leading-snug">
              Enter the citrulline your pre-workout claims per scoop and we&apos;ll show how much real
              L-citrulline you actually get — most 2:1 blends quietly fall short.
            </p>
          )}
        </div>

        {/* tub longevity */}
        <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Tub size — see how many servings it gives
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
              <p className="text-sm text-white/90">Servings per tub</p>
              <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                At {result.productDose}g per serving. A standalone tub is far cheaper per effective gram
                than the citrulline buried in a scoop of pre-workout.
              </p>
            </div>
            <p className="text-2xl font-black text-lab-lime tabular-nums whitespace-nowrap">{result.servings}</p>
          </div>
        </div>

        {/* funnel */}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <Link
            href="/best/pre-workout"
            onClick={() => track('calculator_cta', { tab: 'citrulline', target: 'best-pre-workout' })}
            className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
          >
            Best pre-workout 2026
          </Link>
          <Link
            href="/ingredients/l-citrulline"
            onClick={() => track('calculator_cta', { tab: 'citrulline', target: 'ingredient' })}
            className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
          >
            Citrulline explained
          </Link>
        </div>
      </div>
    </div>
  )
}
