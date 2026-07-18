'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type System = 'metric' | 'imperial'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// WHO adult BMI bands. Colours mirror the site's traffic-light system, but the whole
// point of this tool is the honest caveat that a high BMI from muscle is not the same
// health signal as a high BMI from fat.
type Band = { min: number; label: string; color: string; blurb: string }
const BANDS: Band[] = [
  { min: 30, label: 'Obese', color: '#ef4444', blurb: 'BMI 30 and above. On the raw scale this flags higher health risk — but muscle can push a lean, heavily trained lifter here too. Body fat % tells you which it is.' },
  { min: 25, label: 'Overweight', color: '#f59e0b', blurb: 'BMI 25 to 29.9. Extremely common for muscular lifters, who are rarely "overweight" in any meaningful sense. Check body fat before you trust this label.' },
  { min: 18.5, label: 'Normal', color: '#a6e22e', blurb: 'BMI 18.5 to 24.9. The reference-healthy band for the general population, though many well-muscled athletes sit just above it.' },
  { min: 0, label: 'Underweight', color: '#3b82f6', blurb: 'BMI under 18.5. Often a sign there is lean mass and strength to build — eat enough and train.' },
]

// Ascending copy of the bands for rendering the scale top-to-bottom.
const SCALE = [...BANDS].reverse()

function bandFor(bmi: number): Band {
  return BANDS.find((b) => bmi >= b.min) ?? BANDS[BANDS.length - 1]
}

export default function BmiCalculator() {
  const [system, setSystem] = useState<System>('metric')
  // metric
  const [cm, setCm] = useState('')
  const [kg, setKg] = useState('')
  // imperial
  const [ft, setFt] = useState('')
  const [inch, setInch] = useState('')
  const [lb, setLb] = useState('')

  const result = useMemo(() => {
    let heightM = 0
    let weightKg = 0
    if (system === 'metric') {
      heightM = num(cm) / 100
      weightKg = num(kg)
    } else {
      const totalIn = num(ft) * 12 + num(inch)
      heightM = totalIn * 0.0254
      weightKg = num(lb) * 0.453592
    }
    if (heightM <= 0 || weightKg <= 0) return null
    const bmi = weightKg / (heightM * heightM)
    if (!Number.isFinite(bmi) || bmi <= 0 || bmi > 100) return null
    return { bmi: Math.round(bmi * 10) / 10, band: bandFor(bmi) }
  }, [system, cm, kg, ft, inch, lb])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* unit system */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['metric', 'imperial'] as System[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSystem(s)}
              className="text-[11px] font-black uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
              style={system === s
                ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                : { borderColor: '#262626', color: '#a3a3a3' }}
            >
              {s === 'metric' ? 'Metric (cm / kg)' : 'Imperial (ft / lb)'}
            </button>
          ))}
        </div>

        {system === 'metric' ? (
          <div className="grid grid-cols-2 gap-3 mb-6">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                Height (cm)
              </span>
              <input
                type="number" inputMode="decimal" min="0" placeholder="e.g. 178"
                value={cm} onChange={(e) => setCm(e.target.value)}
                onBlur={() => track('calculator_bmi', { system })} className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                Weight (kg)
              </span>
              <input
                type="number" inputMode="decimal" min="0" placeholder="e.g. 82"
                value={kg} onChange={(e) => setKg(e.target.value)}
                onBlur={() => track('calculator_bmi', { system })} className={inputCls}
              />
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-3 mb-6">
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                Height (ft)
              </span>
              <input
                type="number" inputMode="numeric" min="0" placeholder="5"
                value={ft} onChange={(e) => setFt(e.target.value)} className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                (in)
              </span>
              <input
                type="number" inputMode="numeric" min="0" placeholder="10"
                value={inch} onChange={(e) => setInch(e.target.value)} className={inputCls}
              />
            </label>
            <label className="block">
              <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
                Weight (lb)
              </span>
              <input
                type="number" inputMode="decimal" min="0" placeholder="180"
                value={lb} onChange={(e) => setLb(e.target.value)}
                onBlur={() => track('calculator_bmi', { system })} className={inputCls}
              />
            </label>
          </div>
        )}

        {result ? (
          <>
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Your BMI
              </p>
              <div className="flex items-baseline gap-3">
                <p className="text-4xl font-black tabular-nums leading-none" style={{ color: result.band.color }}>
                  {result.bmi}
                </p>
                <span
                  className="text-[11px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ color: result.band.color, background: `${result.band.color}1a` }}
                >
                  {result.band.label}
                </span>
              </div>
              <p className="text-xs text-lab-muted leading-snug mt-3">{result.band.blurb}</p>

              {/* the whole reason a lifter should not stop at BMI */}
              {result.bmi >= 25 && (
                <div
                  className="mt-4 rounded-lg border p-3.5"
                  style={{ borderColor: `rgba(${AR},0.35)`, background: `rgba(${AR},0.06)` }}
                >
                  <p className="text-[11px] uppercase tracking-[0.2em] font-black text-lab-lime mb-1.5">
                    Read this before you panic
                  </p>
                  <p className="text-xs text-white/80 leading-relaxed">
                    BMI cannot tell muscle from fat. If you lift, a reading of {result.bmi} probably
                    reflects lean mass, not excess fat. Estimate your body fat % or FFMI below — those
                    actually measure your physique.
                  </p>
                </div>
              )}
            </div>

            {/* full band scale */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                The BMI scale
              </p>
              <div className="space-y-2">
                {SCALE.map((b) => {
                  const active = b.label === result.band.label
                  const range =
                    b.label === 'Underweight' ? 'under 18.5'
                    : b.label === 'Normal' ? '18.5 – 24.9'
                    : b.label === 'Overweight' ? '25 – 29.9'
                    : '30 and above'
                  return (
                    <div
                      key={b.label}
                      className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 border transition-colors"
                      style={active
                        ? { borderColor: b.color, background: `${b.color}14` }
                        : { borderColor: '#262626' }}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: b.color }} />
                        <span className={`text-sm ${active ? 'text-white font-bold' : 'text-white/70'}`}>
                          {b.label}
                        </span>
                      </div>
                      <span className="text-xs text-lab-muted tabular-nums whitespace-nowrap">{range}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* funnel to the tools that actually measure a physique */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/calculators/body-fat"
                onClick={() => track('calculator_cta', { tab: 'bmi', target: 'body-fat' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Body fat %
              </Link>
              <Link
                href="/calculators/ffmi"
                onClick={() => track('calculator_cta', { tab: 'bmi', target: 'ffmi' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                FFMI score
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your height and weight to see your BMI — then use the better tools below.
          </p>
        )}
      </div>
    </div>
  )
}
