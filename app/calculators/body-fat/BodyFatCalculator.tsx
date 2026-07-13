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

// ACE body-fat categories, split by sex. Ordered low → high; each carries a
// colour so the result reads like a traffic light (lean/fit = lime, average =
// amber, over = red, essential/too-low = blue as a "don't chase this" flag).
type Band = { max: number; label: string; colour: string }
const BANDS: Record<Sex, Band[]> = {
  male: [
    { max: 6, label: 'Essential fat', colour: '#60a5fa' },
    { max: 14, label: 'Athletic', colour: '#a6e22e' },
    { max: 18, label: 'Fitness', colour: '#a6e22e' },
    { max: 25, label: 'Average', colour: '#f5a524' },
    { max: Infinity, label: 'Above average', colour: '#ef4444' },
  ],
  female: [
    { max: 14, label: 'Essential fat', colour: '#60a5fa' },
    { max: 21, label: 'Athletic', colour: '#a6e22e' },
    { max: 25, label: 'Fitness', colour: '#a6e22e' },
    { max: 32, label: 'Average', colour: '#f5a524' },
    { max: Infinity, label: 'Above average', colour: '#ef4444' },
  ],
}

function classify(sex: Sex, bf: number): Band {
  return BANDS[sex].find((b) => bf < b.max) ?? BANDS[sex][BANDS[sex].length - 1]
}

// US Navy circumference method (metric-native form). Inputs in cm; log10.
function navyBodyFat(sex: Sex, heightCm: number, neckCm: number, waistCm: number, hipCm: number): number | null {
  const log10 = (x: number) => Math.log10(x)
  if (sex === 'male') {
    const d = waistCm - neckCm
    if (d <= 0 || heightCm <= 0) return null
    const bf = 495 / (1.0324 - 0.19077 * log10(d) + 0.15456 * log10(heightCm)) - 450
    return bf
  }
  const d = waistCm + hipCm - neckCm
  if (d <= 0 || heightCm <= 0) return null
  const bf = 495 / (1.29579 - 0.35004 * log10(d) + 0.221 * log10(heightCm)) - 450
  return bf
}

const IN_TO_CM = 2.54
const LB_TO_KG = 0.453592

export default function BodyFatCalculator() {
  const [unit, setUnit] = useState<Unit>('metric')
  const [sex, setSex] = useState<Sex>('male')
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [neck, setNeck] = useState('') // cm or in
  const [waist, setWaist] = useState('') // cm or in
  const [hip, setHip] = useState('') // cm or in (female only)
  const [weight, setWeight] = useState('') // optional: kg or lb

  const result = useMemo(() => {
    const toCm = (v: string) => (unit === 'metric' ? num(v) : num(v) * IN_TO_CM)
    const cm =
      unit === 'metric'
        ? num(heightCm)
        : (num(heightFt) * 12 + num(heightIn)) * IN_TO_CM
    const neckCm = toCm(neck)
    const waistCm = toCm(waist)
    const hipCm = sex === 'female' ? toCm(hip) : 0

    if (cm <= 0 || neckCm <= 0 || waistCm <= 0) return null
    if (sex === 'female' && hipCm <= 0) return null

    const raw = navyBodyFat(sex, cm, neckCm, waistCm, hipCm)
    if (raw === null || !Number.isFinite(raw) || raw <= 0) return null
    const bf = Math.min(70, Math.max(2, raw))
    const band = classify(sex, bf)

    // Optional lean/fat mass split if a bodyweight is supplied.
    const kg = weight ? (unit === 'metric' ? num(weight) : num(weight) * LB_TO_KG) : 0
    let masses: { fatKg: number; leanKg: number; unitLabel: string } | null = null
    if (kg > 0) {
      const fatKg = (kg * bf) / 100
      const leanKg = kg - fatKg
      const back = (v: number) => (unit === 'metric' ? v : v / LB_TO_KG)
      masses = {
        fatKg: Math.round(back(fatKg) * 10) / 10,
        leanKg: Math.round(back(leanKg) * 10) / 10,
        unitLabel: unit === 'metric' ? 'kg' : 'lb',
      }
    }

    return { bf: Math.round(bf * 10) / 10, band, masses }
  }, [unit, sex, heightCm, heightFt, heightIn, neck, waist, hip, weight])

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
            The formula and healthy ranges differ by sex — women also measure the hip.
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

        {/* circumference measurements */}
        <div className={`grid ${sex === 'female' ? 'grid-cols-3' : 'grid-cols-2'} gap-3 mb-5`}>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Neck ({unit === 'metric' ? 'cm' : 'in'})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'metric' ? 'e.g. 40' : 'e.g. 16'}
              value={neck}
              onChange={(e) => setNeck(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Waist ({unit === 'metric' ? 'cm' : 'in'})
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'metric' ? 'e.g. 85' : 'e.g. 34'}
              value={waist}
              onChange={(e) => setWaist(e.target.value)}
              className={inputCls}
            />
          </label>
          {sex === 'female' && (
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                Hip ({unit === 'metric' ? 'cm' : 'in'})
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder={unit === 'metric' ? 'e.g. 95' : 'e.g. 37'}
                value={hip}
                onChange={(e) => setHip(e.target.value)}
                className={inputCls}
              />
            </label>
          )}
        </div>
        <p className="text-[11px] text-lab-muted/80 -mt-2 mb-5 leading-snug">
          Measure relaxed with a tape held snug, not tight. Waist at the navel, neck below the larynx
          {sex === 'female' ? ', hip at the widest point.' : '.'}
        </p>

        {/* optional bodyweight */}
        <div className="mb-6">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Bodyweight ({unit === 'metric' ? 'kg' : 'lb'}) <span className="text-lab-muted/60 normal-case tracking-normal">— optional</span>
            </span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'metric' ? 'e.g. 82' : 'e.g. 180'}
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => { if (num(weight) > 0) track('calculator_bodyfat', { sex }) }}
              className={inputCls}
            />
          </label>
          <p className="text-[11px] text-lab-muted/80 mt-2 leading-snug">
            Add your weight to also see your fat mass and lean (fat-free) mass.
          </p>
        </div>

        {result ? (
          <>
            {/* headline: body fat % */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Estimated body fat
              </p>
              <p className="text-4xl font-black tabular-nums leading-none mb-3" style={{ color: result.band.colour }}>
                {result.bf.toFixed(1)}
                <span className="text-xl text-white/70 ml-1">%</span>
              </p>
              <span
                className="inline-block text-[11px] font-black uppercase tracking-widest px-3 py-1 rounded-full"
                style={{ color: result.band.colour, background: `${result.band.colour}1a`, border: `1px solid ${result.band.colour}55` }}
              >
                {result.band.label}
              </span>

              {result.masses && (
                <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-white/90">Lean (fat-free) mass</span>
                    <span className="text-white font-black tabular-nums">
                      {result.masses.leanKg} {result.masses.unitLabel}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-lab-muted">Fat mass</span>
                    <span className="text-lab-muted font-bold tabular-nums">
                      {result.masses.fatKg} {result.masses.unitLabel}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* category scale for this sex */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-4">
                Where you sit ({sex === 'male' ? 'men' : 'women'})
              </p>
              <div className="space-y-2">
                {BANDS[sex].map((b, i) => {
                  const lo = i === 0 ? 2 : BANDS[sex][i - 1].max
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
                        {b.max === Infinity ? `${lo}%+` : `${lo}–${b.max}%`}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* funnel — recomposition traffic to protein + stack */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/calculators/tdee"
                onClick={() => track('calculator_cta', { tab: 'bodyfat', target: 'tdee' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Set my calories
              </Link>
              <Link
                href="/wizard"
                onClick={() => track('calculator_cta', { tab: 'bodyfat', target: 'wizard' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Build my stack
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your height, neck and waist{sex === 'female' ? ' and hip' : ''} measurements to see your body fat.
          </p>
        )}
      </div>
    </div>
  )
}
