'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'metric' | 'imperial'
type GoalKey = 'build' | 'cut' | 'maintain' | 'health'

const AR = '166,226,46'
const LB_TO_KG = 0.453592
const SCOOP_G = 24 // protein per typical 30g whey scoop

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Evidence-based daily protein ranges in grams per kg of bodyweight.
// Building/maintaining: ISSN position stand 1.4-2.0 g/kg for active people;
// deficit pushed higher (~1.8-2.4 g/kg) to spare lean mass; general-health
// floor around the 0.8-1.0 g/kg mark for lightly active adults.
type Goal = { key: GoalKey; label: string; sub: string; lo: number; hi: number }
const GOALS: Goal[] = [
  { key: 'build', label: 'Build muscle', sub: 'Training hard in a surplus or at maintenance', lo: 1.6, hi: 2.2 },
  { key: 'cut', label: 'Lose fat, keep muscle', sub: 'Eating in a calorie deficit', lo: 1.8, hi: 2.4 },
  { key: 'maintain', label: 'Maintain / stay active', sub: 'Keeping the muscle you have', lo: 1.4, hi: 1.6 },
  { key: 'health', label: 'General health', sub: 'Lightly active, no physique goal', lo: 0.8, hi: 1.0 },
]

export default function ProteinCalculator() {
  const [unit, setUnit] = useState<Unit>('metric')
  const [goal, setGoal] = useState<GoalKey>('build')
  const [weight, setWeight] = useState('')
  const [meals, setMeals] = useState(4)

  const result = useMemo(() => {
    const kg = unit === 'metric' ? num(weight) : num(weight) * LB_TO_KG
    if (kg <= 0) return null

    const g = GOALS.find((x) => x.key === goal) ?? GOALS[0]
    const lowG = Math.round(kg * g.lo)
    const highG = Math.round(kg * g.hi)
    const mid = Math.round((lowG + highG) / 2)
    const perMeal = Math.round(mid / meals)
    // ~0.4 g/kg per meal maximises the muscle-building response per sitting.
    const mpsPerMeal = Math.round(kg * 0.4)
    const scoops = Math.max(1, Math.round(mid / SCOOP_G))

    return { lowG, highG, mid, perMeal, mpsPerMeal, scoops }
  }, [unit, goal, weight, meals])

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

        {/* goal */}
        <div className="mb-5">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Your goal
          </span>
          <div className="grid gap-2">
            {GOALS.map((g) => {
              const active = goal === g.key
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => setGoal(g.key)}
                  className="text-left px-4 py-3 rounded-lg border transition-colors"
                  style={active
                    ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                    : { borderColor: '#262626' }}
                >
                  <span
                    className="block text-sm font-bold"
                    style={{ color: active ? '#a6e22e' : '#e5e5e5' }}
                  >
                    {g.label}
                  </span>
                  <span className="block text-[11px] text-lab-muted leading-snug mt-0.5">{g.sub}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* weight + meals */}
        <div className="grid grid-cols-2 gap-3 mb-6">
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
              onBlur={() => { if (num(weight) > 0) track('calculator_protein', { goal }) }}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Meals per day
            </span>
            <select
              value={meals}
              onChange={(e) => setMeals(parseInt(e.target.value, 10))}
              className={inputCls}
            >
              {[3, 4, 5, 6].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
        </div>

        {result ? (
          <>
            {/* headline: daily protein target */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Daily protein target
              </p>
              <p className="text-4xl font-black tabular-nums leading-none mb-1 text-lab-lime">
                {result.mid}g
              </p>
              <p className="text-sm text-lab-muted">
                Aim within <span className="text-white/90 font-bold">{result.lowG}–{result.highG}g</span> per day
              </p>

              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-white/90">Per meal ({meals} meals)</span>
                  <span className="text-white font-black tabular-nums">{result.perMeal}g</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-lab-muted">Optimal per-meal dose (for muscle)</span>
                  <span className="text-lab-muted font-bold tabular-nums">{result.mpsPerMeal}g</span>
                </div>
              </div>
            </div>

            {/* whey anchor — funnel context, not a prescription */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-sm text-white/90 leading-relaxed">
                Hitting <span className="text-lab-lime font-bold tabular-nums">{result.mid}g</span> from
                whole food alone is the hard part. One 30g scoop of whey adds about {SCOOP_G}g, so a
                scoop or two a day is the simplest way to close the gap — roughly{' '}
                <span className="text-white font-bold tabular-nums">{result.scoops}</span>{' '}
                {result.scoops === 1 ? 'scoop' : 'scoops'} would cover your whole target.
              </p>
            </div>

            {/* funnel */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/best/whey"
                onClick={() => track('calculator_cta', { tab: 'protein', target: 'whey' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Best whey 2026
              </Link>
              <Link
                href="/calculators/tdee"
                onClick={() => track('calculator_cta', { tab: 'protein', target: 'tdee' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Full macros
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your bodyweight and pick a goal to see your daily protein target.
          </p>
        )}
      </div>
    </div>
  )
}
