'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'metric' | 'imperial'
type Sex = 'male' | 'female'
type Goal = 'cut' | 'maintain' | 'bulk'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

function round10(x: number): number {
  return Math.round(x / 10) * 10
}

// Activity multipliers applied to BMR to reach total daily energy expenditure.
// Standard Harris/Mifflin activity factors — the band every TDEE tool uses.
const ACTIVITY: { id: string; mult: number; label: string; hint: string }[] = [
  { id: 'sedentary', mult: 1.2, label: 'Sedentary', hint: 'Desk job, little or no exercise' },
  { id: 'light', mult: 1.375, label: 'Light', hint: 'Light training 1–3 days a week' },
  { id: 'moderate', mult: 1.55, label: 'Moderate', hint: 'Training 3–5 days a week' },
  { id: 'active', mult: 1.725, label: 'Active', hint: 'Hard training 6–7 days a week' },
  { id: 'athlete', mult: 1.9, label: 'Athlete', hint: 'Twice-daily or a physical job' },
]

// Goal calorie adjustment + the protein target we build macros around. Protein is
// set per kg of bodyweight (the evidence band the whey guide cites), pushed higher
// on a cut to protect lean mass; fat holds a hormonal-health floor and carbs fill
// the rest.
const GOALS: Record<Goal, { mult: number; proteinGkg: number; label: string; blurb: string }> = {
  cut: { mult: 0.8, proteinGkg: 2.2, label: 'Lose fat', blurb: 'A ~20% deficit for steady fat loss, with protein high to hold muscle.' },
  maintain: { mult: 1.0, proteinGkg: 1.8, label: 'Maintain', blurb: 'Eat at maintenance to hold your weight and fuel training.' },
  bulk: { mult: 1.1, proteinGkg: 2.0, label: 'Lean bulk', blurb: 'A modest ~10% surplus to add muscle without excess fat gain.' },
}

const FAT_GKG = 0.9 // hormonal-health floor, ~0.8–1.0 g/kg

export default function TdeeCalculator() {
  const [unit, setUnit] = useState<Unit>('metric')
  const [sex, setSex] = useState<Sex>('male')
  const [age, setAge] = useState('')
  const [weight, setWeight] = useState('') // kg (metric) or lb (imperial)
  const [heightCm, setHeightCm] = useState('')
  const [heightFt, setHeightFt] = useState('')
  const [heightIn, setHeightIn] = useState('')
  const [activity, setActivity] = useState('moderate')
  const [goal, setGoal] = useState<Goal>('cut')

  const result = useMemo(() => {
    const kg = unit === 'metric' ? num(weight) : num(weight) * 0.453592
    const cm =
      unit === 'metric'
        ? num(heightCm)
        : (num(heightFt) * 12 + num(heightIn)) * 2.54
    const a = Math.round(num(age))
    if (kg <= 0 || cm <= 0 || a <= 0) return null

    // Mifflin-St Jeor — the most accurate BMR equation for the general population.
    const bmr = 10 * kg + 6.25 * cm - 5 * a + (sex === 'male' ? 5 : -161)
    const act = ACTIVITY.find((x) => x.id === activity) ?? ACTIVITY[2]
    const tdee = bmr * act.mult

    const g = GOALS[goal]
    const goalCals = tdee * g.mult

    const proteinG = Math.round(g.proteinGkg * kg)
    const fatG = Math.round(FAT_GKG * kg)
    const carbCals = goalCals - (proteinG * 4 + fatG * 9)
    const carbG = Math.max(0, Math.round(carbCals / 4))

    return {
      bmr: round10(bmr),
      tdee: round10(tdee),
      goalCals: round10(goalCals),
      spec: g,
      macros: { proteinG, fatG, carbG },
    }
  }, [unit, sex, age, weight, heightCm, heightFt, heightIn, activity, goal])

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
            Used only to pick the correct BMR constant — the equation differs by sex.
          </p>
        </div>

        {/* age + weight */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Age
            </span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              placeholder="e.g. 38"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block">
            <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
              Weight ({unit === 'metric' ? 'kg' : 'lb'})
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

        {/* activity */}
        <div className="mb-5">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Activity level
          </span>
          <div className="space-y-2">
            {ACTIVITY.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setActivity(a.id)}
                className="w-full flex items-center justify-between gap-3 text-left px-3.5 py-2.5 rounded-lg border transition-colors"
                style={activity === a.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <div className="min-w-0">
                  <p className="text-sm font-bold" style={{ color: activity === a.id ? '#a6e22e' : '#e5e5e5' }}>
                    {a.label}
                  </p>
                  <p className="text-[11px] text-lab-muted leading-snug">{a.hint}</p>
                </div>
                <span className="text-[11px] text-lab-muted tabular-nums shrink-0">×{a.mult}</span>
              </button>
            ))}
          </div>
        </div>

        {/* goal */}
        <div className="mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Your goal
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(Object.keys(GOALS) as Goal[]).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => { setGoal(g); track('calculator_tdee', { goal: g }) }}
                className="text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
                style={goal === g
                  ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626', color: '#a3a3a3' }}
              >
                {GOALS[g].label}
              </button>
            ))}
          </div>
        </div>

        {result ? (
          <>
            {/* headline: goal calories */}
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Daily calories to {result.spec.label.toLowerCase()}
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                {result.goalCals}
                <span className="text-xl text-white/70 ml-1">kcal</span>
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-3">{result.spec.blurb}</p>

              {/* BMR / maintenance breakdown */}
              <div className="mt-4 pt-3 border-t border-lab-border space-y-2">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-white/90">Maintenance (TDEE)</span>
                  <span className="text-white font-black tabular-nums">{result.tdee} kcal</span>
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="text-sm text-lab-muted">Resting burn (BMR)</span>
                  <span className="text-lab-muted font-bold tabular-nums">{result.bmr} kcal</span>
                </div>
              </div>
            </div>

            {/* macro split */}
            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-4">
                Your daily macros
              </p>
              <div className="grid grid-cols-3 gap-3">
                {[
                  { k: 'Protein', v: result.macros.proteinG },
                  { k: 'Carbs', v: result.macros.carbG },
                  { k: 'Fat', v: result.macros.fatG },
                ].map((m) => (
                  <div key={m.k} className="text-center bg-lab-panel border border-lab-border rounded-lg py-4">
                    <p className="text-2xl font-black text-lab-lime tabular-nums leading-none">{m.v}</p>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-white/60 mt-1">g</p>
                    <p className="text-[11px] text-lab-muted mt-1.5">{m.k}</p>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-lab-muted/80 leading-snug mt-4">
                Protein at {result.spec.proteinGkg}g/kg to {goal === 'cut' ? 'protect muscle in a deficit' : 'support training'},
                fat at a {FAT_GKG}g/kg hormonal-health floor, and carbs filling the rest for training fuel.
              </p>
            </div>

            {/* funnel — nutrition traffic to the products that close the protein gap */}
            <div className="grid grid-cols-2 gap-2 mt-5">
              <Link
                href="/products?category=whey"
                onClick={() => track('calculator_cta', { tab: 'tdee', target: 'whey' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
              >
                Hit your protein
              </Link>
              <Link
                href="/wizard"
                onClick={() => track('calculator_cta', { tab: 'tdee', target: 'wizard' })}
                className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
              >
                Build my stack
              </Link>
            </div>
          </>
        ) : (
          <p className="text-sm text-lab-muted">
            Enter your age, weight and height to see your calories and macros.
          </p>
        )}
      </div>
    </div>
  )
}
