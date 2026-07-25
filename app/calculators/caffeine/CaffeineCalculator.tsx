'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'

const AR = '166,226,46'

// Caffeine half-life in healthy adults averages ~5 hours (range ~4-6h). We use 5h.
const HALF_LIFE_H = 5
// A residual of ~100mg at lights-out is a commonly cited "won't wreck your sleep" ceiling.
const SLEEP_SAFE_MG = 100
// Reference drink caffeine (mg) — brewed filter coffee mug and a single espresso shot.
const MG_PER_COFFEE = 95
const MG_PER_ESPRESSO = 63
// EFSA single-serving and daily ceilings for healthy adults (mg).
const SINGLE_CEIL = 200 // EFSA: single doses up to 200mg raise no safety concern
const DAILY_CEIL = 400

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

function round5(n: number): number {
  return Math.round(n / 5) * 5
}

// Remaining caffeine after `hours` of first-order decay.
function remaining(dose: number, hours: number): number {
  return dose * Math.pow(0.5, hours / HALF_LIFE_H)
}

// Hours for `dose` to decay to `target` (0 if already at/below target).
function hoursToDecay(dose: number, target: number): number {
  if (dose <= target) return 0
  return HALF_LIFE_H * (Math.log(dose / target) / Math.log(2))
}

// Parse a "HH:MM" 24h time to minutes-since-midnight; null if blank/invalid.
function parseTime(t: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t)
  if (!m) return null
  const h = parseInt(m[1], 10)
  const min = parseInt(m[2], 10)
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

function fmtTime(mins: number): string {
  const m = ((mins % 1440) + 1440) % 1440
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function fmtHours(h: number): string {
  const whole = Math.floor(h)
  const mins = Math.round((h - whole) * 60)
  if (whole <= 0) return `${mins} min`
  if (mins === 0) return `${whole} hr`
  return `${whole} hr ${mins} min`
}

export default function CaffeineCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [weight, setWeight] = useState('')
  const [dose, setDose] = useState('') // mg — the actual serving they plan to take
  const [bedtime, setBedtime] = useState('') // HH:MM

  const weightKg = toKg(num(weight), unit)

  // Performance dose band from bodyweight — the studied 3-6 mg/kg range.
  const perf = useMemo(() => {
    if (weightKg <= 0) return null
    const low = round5(weightKg * 3)
    const high = round5(weightKg * 6)
    const cappedHigh = Math.min(high, DAILY_CEIL)
    return { low, high, cappedHigh, overCeil: high > DAILY_CEIL }
  }, [weightKg])

  // Suggested dose used when the user hasn't typed their own serving yet.
  const doseMg = num(dose) || (perf ? perf.cappedHigh : 0)
  const usingSuggested = num(dose) <= 0 && doseMg > 0

  const sleep = useMemo(() => {
    if (doseMg <= 0) return null
    const coffees = doseMg / MG_PER_COFFEE
    const espressos = doseMg / MG_PER_ESPRESSO

    // Time for the dose to fall to sleep-safe, and to a near-negligible 50mg / 25mg.
    const hTo100 = hoursToDecay(doseMg, SLEEP_SAFE_MG)
    const hTo50 = hoursToDecay(doseMg, 50)
    const hTo25 = hoursToDecay(doseMg, 25)

    const bedMins = parseTime(bedtime)
    let residualAtBed: number | null = null
    let latestIntake: string | null = null
    if (bedMins !== null) {
      // Latest clock time to take this dose so residual at bedtime <= sleep-safe.
      latestIntake = fmtTime(bedMins - Math.round(hTo100 * 60))
    }

    return {
      coffees,
      espressos,
      hTo100,
      hTo50,
      hTo25,
      residualAtBed,
      latestIntake,
      overSingle: doseMg > SINGLE_CEIL,
    }
  }, [doseMg, bedtime])

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
              onBlur={() => track('calculator_caffeine', { unit })}
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

        {perf ? (
          <>
            {/* headline performance dose */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Effective pre-workout dose
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {perf.low}&ndash;{perf.cappedHigh}<span className="text-xl text-white/70 ml-1">mg</span>
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-3">
                Based on 3&ndash;6mg per kg of bodyweight, the range studied for focus, power and lower
                perceived effort. Take it 30 to 60 minutes before you train.
                {perf.overCeil && (
                  <span className="text-amber-400"> Your upper figure is capped at 400mg — the daily
                    ceiling for healthy adults, and where the downsides start to outweigh the benefits.</span>
                )}
              </p>
              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-sm text-white/90">Sensible single serving</p>
                  <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">&le; 200 mg</p>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white/90">Daily ceiling (adults)</p>
                    <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">EFSA guidance, from all sources.</p>
                  </div>
                  <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">400 mg</p>
                </div>
              </div>
            </div>

            {/* caffeine & sleep — the deeper half-life tool */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Caffeine &amp; sleep — how long it lingers
              </p>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.2em] font-bold text-lab-muted mb-2">
                    Dose (mg)
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    placeholder={perf ? String(perf.cappedHigh) : 'e.g. 200'}
                    value={dose}
                    onChange={(e) => setDose(e.target.value)}
                    onBlur={() => track('calculator_caffeine_sleep', { dose: num(dose) })}
                    className={inputCls}
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-[0.2em] font-bold text-lab-muted mb-2">
                    Bedtime (optional)
                  </span>
                  <input
                    type="time"
                    value={bedtime}
                    onChange={(e) => setBedtime(e.target.value)}
                    className={inputCls + ' [color-scheme:dark]'}
                  />
                </label>
              </div>

              {sleep && (
                <>
                  {usingSuggested && (
                    <p className="text-[11px] text-lab-muted leading-snug mb-3 -mt-1">
                      Using your {perf.cappedHigh}mg dose — type your pre-workout&apos;s actual caffeine to refine.
                    </p>
                  )}

                  <p className="text-xs text-lab-muted leading-snug mb-3">
                    Roughly <span className="text-white/80">{sleep.coffees.toFixed(1)} mugs of coffee</span> or{' '}
                    <span className="text-white/80">{sleep.espressos.toFixed(1)} espresso shots</span>. Caffeine has a
                    ~5 hour half-life, so half is still in you 5 hours later.
                    {sleep.overSingle && (
                      <span className="text-amber-400"> That is above the 200mg single-serving comfort mark.</span>
                    )}
                  </p>

                  {sleep.latestIntake ? (
                    <div className="rounded-lg p-4 mb-3" style={{ background: `rgba(${AR},0.08)`, border: `1px solid rgba(${AR},0.4)` }}>
                      <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-1">
                        Take it before
                      </p>
                      <p className="text-3xl font-black text-lab-lime tabular-nums leading-none">
                        {sleep.latestIntake}
                      </p>
                      <p className="text-[11px] text-lab-muted mt-2 leading-snug">
                        Later than this and more than {SLEEP_SAFE_MG}mg is still circulating at your {bedtime} bedtime,
                        which is enough to cut into deep sleep for many people.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-lab-muted leading-snug mb-3">
                      Add your bedtime to see the latest clock time you can take this dose without more than{' '}
                      {SLEEP_SAFE_MG}mg lingering at lights-out.
                    </p>
                  )}

                  <div className="pt-1 space-y-2">
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm text-white/90">Down to 100mg after</p>
                      <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{fmtHours(sleep.hTo100)}</p>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm text-white/90">Down to 50mg after</p>
                      <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{fmtHours(sleep.hTo50)}</p>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <p className="text-sm text-white/90">Down to 25mg after</p>
                      <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{fmtHours(sleep.hTo25)}</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* funnel */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/strongest-pre-workout"
                onClick={() => track('calculator_cta', { tab: 'caffeine', target: 'strongest-pre-workout' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Strongest pre-workouts
              </Link>
              <Link
                href="/guide/pre-workout"
                onClick={() => track('calculator_cta', { tab: 'caffeine', target: 'guide' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Pre-workout guide
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your bodyweight — we&apos;ll show your effective caffeine range, then help you time it so
            it doesn&apos;t wreck your sleep.
          </p>
        )}
      </div>
    </div>
  )
}
