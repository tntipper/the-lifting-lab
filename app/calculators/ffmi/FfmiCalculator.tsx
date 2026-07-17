'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'metric' | 'imperial'
type Sex = 'male' | 'female'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// FFMI interpretation bands, split by sex, on the height-normalised scale.
// Ordered low → high. Lime = well-muscled natural range; red flags the band
// above the documented natural ceiling (a statistical flag, NOT a verdict).
type Band = { max: number; label: string; colour: string }
const BANDS: Record<Sex, Band[]> = {
  male: [
    { max: 18, label: 'Below average', colour: '#60a5fa' },
    { max: 20, label: 'Average', colour: '#9ca3af' },
    { max: 22, label: 'Above average', colour: '#a6e22e' },
    { max: 23, label: 'Excellent', colour: '#a6e22e' },
    { max: 25, label: 'Superior — near natural limit', colour: '#a6e22e' },
    { max: Infinity, label: 'Above the natural range', colour: '#ef4444' },
  ],
  female: [
    { max: 15, label: 'Below average', colour: '#60a5fa' },
    { max: 16.5, label: 'Average', colour: '#9ca3af' },
    { max: 18, label: 'Above average', colour: '#a6e22e' },
    { max: 19, label: 'Excellent', colour: '#a6e22e' },
    { max: 21.5, label: 'Superior — near natural limit', colour: '#a6e22e' },
    { max: Infinity, label: 'Above the natural range', colour: '#ef4444' },
  ],
}

function classify(sex: Sex, ffmi: number): Band {
  return BANDS[sex].find((b) => ffmi < b.max) ?? BANDS[sex][BANDS[sex].length - 1]
}

const IN_TO_CM = 2.54
const LB_TO_KG = 0.453592

export default function FfmiCalculator() {
  const [unit, setUnit] = useState<Unit>('metric')
  const [sex, setSex] = useState<Sex>('male')
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [weight, setWeight] = useState('') // kg or lb
  const [bodyFat, setBodyFat] = useState('') // %

  const result = useMemo(() => {
    const cm =
      unit === 'metric'
        ? num(heightCm)
        : (num(heightFt) * 12 + num(heightIn)) * IN_TO_CM
    const kg = unit === 'metric' ? num(weight) : num(weight) * LB_TO_KG
    const bf = num(bodyFat)

    if (cm <= 0 || kg <= 0 || bf <= 0 || bf >= 70) return null

    const heightM = cm / 100
    const leanKg = kg * (1 - bf / 100)
    const ffmi = leanKg / (heightM * heightM)
    // Kouri height-normalisation to a 1.8 m reference height.
    const normFfmi = ffmi + 6.1 * (1.8 - heightM)
    if (!Number.isFinite(ffmi) || ffmi <= 0) return null

    const band = classify(sex, normFfmi)
    const back = (v: number) => (unit === 'metric' ? v : v / LB_TO_KG)

    return {
      ffmi: Math.round(ffmi * 10) / 10,
      normFfmi: Math.round(normFfmi * 10) / 10,
      band,
      leanMass: Math.round(back(leanKg) * 10) / 10,
      unitLabel: unit === 'metric' ? 'kg' : 'lb',
    }
  }, [unit, sex, heightCm, heightFt, heightIn, weight, bodyFat])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* unit toggle */}
        <div className="flex justify-end mb-5">
          <div className="flex rounded-lg overflow-hidden border border-lab-border">
            {(['metric', 'imperial'] as Unit[]).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => setUnit(u)}
                className="px-4 py-2 text-[11px] font-black uppercase tracking-widest transition-colors"
                style={unit === u ? { background: '#a6e22e', color: '#000' } : { color: '#a3a3a3' }}
              >
                {u === 'metric' ? 'Metric' : 'Imperial'}
              </button>
            ))}
          </div>
        </div>

        {/* sex */}
        <div className="mb-5">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Sex
          </span>
          <div className="grid grid-cols-2 gap-2">
            {(['male', 'female'] as Sex[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSex(s)}
                className="text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
                style={sex === s
                  ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626', color: '#a3a3a3' }}
              >
                {s === 'male' ? 'Male' : 'Female'}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-lab-muted/80 mt-2 leading-snug">
            Men carry more lean mass, so the natural FFMI range sits higher than for women.
          </p>
        </div>

        {/* height */}
        <div className="mb-5">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Height
          </span>
          {unit === 'metric' ? (
            <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder="e.g. 180"
                value={heightCm}
                onChange={(e) => setHeightCm(e.target.value)}
                className={inputCls}
              />
              <span className="text-sm text-lab-muted pr-1">cm</span>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="ft"
                  value={heightFt}
                  onChange={(e) => setHeightFt(e.target.value)}
                  className={inputCls}
                />
                <span className="text-sm text-lab-muted pr-1">ft</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  placeholder="in"
                  value={heightIn}
                  onChange={(e) => setHeightIn(e.target.value)}
                  className={inputCls}
                />
                <span className="text-sm text-lab-muted pr-1">in</span>
              </div>
            </div>
          )}
        </div>

        {/* weight + body fat */}
        <div className="grid grid-cols-2 gap-3 mb-2">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Bodyweight ({unit === 'metric' ? 'kg' : 'lb'})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'metric' ? 'e.g. 82' : 'e.g. 180'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Body fat (%)
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder="e.g. 15"
              value={bodyFat}
              onChange={(e) => setBodyFat(e.target.value)}
              onBlur={() => { if (num(bodyFat) > 0) track('calculator_ffmi', { sex }) }}
              className={inputCls}
            />
          </label>
        </div>
        <p className="text-[11px] text-lab-muted/80 mb-6 leading-snug">
          Not sure of your body fat? Estimate it first with the{' '}
          <Link href="/calculators/body-fat" className="text-lab-lime hover:underline">
            body fat calculator
          </Link>
          , then come back.
        </p>

        {result ? (
          <>
            {/* headline: normalised FFMI */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Normalised FFMI
              </p>
              <p className="text-4xl font-black tabular-nums leading-none mb-3" style={{ color: result.band.colour }}>
                {result.normFfmi.toFixed(1)}
              </p>
              <span
                className="inline-block text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ color: result.band.colour, background: `${result.band.colour}1a`, border: `1px solid ${result.band.colour}55` }}
              >
                {result.band.label}
              </span>

              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-white/90">Raw FFMI (unadjusted)</span>
                  <span className="text-white font-black tabular-nums">{result.ffmi.toFixed(1)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-lab-muted">Fat-free mass</span>
                  <span className="text-lab-muted font-bold tabular-nums">
                    {result.leanMass} {result.unitLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* interpretation scale for this sex */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-4">
                The scale ({sex === 'male' ? 'men' : 'women'})
              </p>
              <div className="space-y-2">
                {BANDS[sex].map((b, i) => {
                  const lo = i === 0 ? 0 : BANDS[sex][i - 1].max
                  const active = b.label === result.band.label
                  return (
                    <div
                      key={b.label}
                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border transition-colors"
                      style={active
                        ? { borderColor: `${b.colour}66`, background: `${b.colour}14` }
                        : { borderColor: '#262626' }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.colour }} />
                        <span className="text-sm font-bold" style={{ color: active ? b.colour : '#e5e5e5' }}>
                          {b.label}
                        </span>
                      </div>
                      <span className="text-[11px] text-lab-muted tabular-nums shrink-0">
                        {b.max === Infinity ? `${lo}+` : i === 0 ? `< ${b.max}` : `${lo}–${b.max}`}
                      </span>
                    </div>
                  )
                })}
              </div>
              <p className="text-[11px] text-lab-muted/80 mt-4 leading-snug">
                FFMI above roughly {sex === 'male' ? '25' : '22'} is at the documented edge of what
                is typically reached drug-free. It is a population correlate, not a drug test —
                genetics, long training age and measurement error all move it.
              </p>
            </div>

            {/* funnel — muscle-building traffic to protein + stack */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/best/whey"
                onClick={() => track('calculator_cta', { tab: 'ffmi', target: 'whey' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Best whey 2026
              </Link>
              <Link
                href="/wizard"
                onClick={() => track('calculator_cta', { tab: 'ffmi', target: 'wizard' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Build my stack
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your height, bodyweight and body fat percentage to see your FFMI.
          </p>
        )}
      </div>
    </div>
  )
}
