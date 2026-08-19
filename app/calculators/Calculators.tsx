'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Tab = 'protein' | 'creatine' | 'caffeine'
type Unit = 'kg' | 'lb'
type Goal = 'build' | 'maintain' | 'cut' | 'endurance'

const AR = '166,226,46'

const TABS: { id: Tab; label: string }[] = [
  { id: 'protein', label: 'Protein' },
  { id: 'creatine', label: 'Creatine' },
  { id: 'caffeine', label: 'Caffeine' },
]

// Goal-based daily protein targets in grams per kg of bodyweight, grounded in the
// same evidence band the whey guide cites (~1.6–2.4 g/kg depending on goal).
const PROTEIN_GKG: Record<Goal, { low: number; high: number; label: string; blurb: string }> = {
  build: { low: 1.8, high: 2.2, label: 'Build muscle', blurb: 'Higher intake supports muscle protein synthesis in a surplus.' },
  maintain: { low: 1.6, high: 1.9, label: 'Maintain', blurb: 'Enough to preserve muscle and recover from training.' },
  cut: { low: 2.0, high: 2.4, label: 'Lose fat', blurb: 'Protein is pushed higher on a cut to protect lean mass.' },
  endurance: { low: 1.4, high: 1.8, label: 'Endurance', blurb: 'Endurance athletes need less than lifters, but still well above sedentary levels.' },
}

function toKg(weight: number, unit: Unit): number {
  return unit === 'kg' ? weight : weight * 0.453592
}

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// Shared card chrome
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
        {label}
      </span>
      {children}
    </label>
  )
}

function ResultRow({ k, v, hint }: { k: string; v: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2 border-b border-lab-border last:border-0">
      <div className="min-w-0">
        <p className="text-sm text-white/90">{k}</p>
        {hint && <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">{hint}</p>}
      </div>
      <p className="text-lab-lime font-black tabular-nums whitespace-nowrap">{v}</p>
    </div>
  )
}

function Cta({ href, children, primary, onClick }: {
  href: string; children: React.ReactNode; primary?: boolean; onClick?: () => void
}) {
  const base = 'text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg transition-all'
  return primary ? (
    <Link href={href} onClick={onClick} className={`${base} bg-lab-lime text-black hover:opacity-90`}>
      {children}
    </Link>
  ) : (
    <Link href={href} onClick={onClick} className={`${base} border border-lab-border text-lab-muted hover:text-white`}>
      {children}
    </Link>
  )
}

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

export default function Calculators() {
  const [tab, setTab] = useState<Tab>('protein')

  // Shared bodyweight input (protein + caffeine).
  const [unit, setUnit] = useState<Unit>('kg')
  const [weight, setWeight] = useState('')
  const weightKg = toKg(num(weight), unit)

  // Protein
  const [goal, setGoal] = useState<Goal>('build')
  const protein = useMemo(() => {
    if (weightKg <= 0) return null
    const g = PROTEIN_GKG[goal]
    return { low: Math.round(weightKg * g.low), high: Math.round(weightKg * g.high), spec: g }
  }, [weightKg, goal])

  // Creatine
  const [loading, setLoading] = useState(false)
  const [tub, setTub] = useState(500) // grams
  const creatine = useMemo(() => {
    const daysAt5g = Math.floor(tub / 5)
    return { daysAt5g }
  }, [tub])

  // Caffeine
  const caffeine = useMemo(() => {
    if (weightKg <= 0) return null
    const low = Math.round(weightKg * 3)
    const high = Math.round(weightKg * 6)
    const cappedHigh = Math.min(high, 400)
    return { low, high, cappedHigh, overCap: high > 400 }
  }, [weightKg])

  function selectTab(t: Tab) {
    setTab(t)
    track('calculator_tab', { tab: t })
  }

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      {/* segmented control */}
      <div className="flex border-b border-lab-border">
        {TABS.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTab(t.id)}
              className="flex-1 py-3.5 text-[11px] font-black uppercase tracking-widest transition-colors"
              style={active
                ? { color: '#a6e22e', background: `rgba(${AR},0.06)`, boxShadow: `inset 0 -2px 0 #a6e22e` }
                : { color: '#a3a3a3' }}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="p-6">
        {/* shared weight input — used by protein + caffeine */}
        {tab !== 'creatine' && (
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end mb-6">
            <Field label="Your bodyweight">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                placeholder={unit === 'kg' ? 'e.g. 82' : 'e.g. 180'}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={inputCls}
              />
            </Field>
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
        )}

        {/* PROTEIN */}
        {tab === 'protein' && (
          <div>
            <Field label="Your goal">
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PROTEIN_GKG) as Goal[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGoal(g)}
                    className="text-[11px] font-bold uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
                    style={goal === g
                      ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                      : { borderColor: '#262626', color: '#a3a3a3' }}
                  >
                    {PROTEIN_GKG[g].label}
                  </button>
                ))}
              </div>
            </Field>

            {protein ? (
              <div className="mt-6 bg-lab-bg border border-lab-border rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                  Daily protein target
                </p>
                <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                  {protein.low}–{protein.high}<span className="text-xl text-white/70 ml-1">g</span>
                </p>
                <p className="text-xs text-lab-muted leading-snug mt-3">{protein.spec.blurb}</p>
                <div className="mt-4 pt-3 border-t border-lab-border">
                  <ResultRow
                    k="From a whey shake"
                    v="~25 g each"
                    hint="Two shakes a day add roughly 50g toward your total. Use food first, whey to close the gap."
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <Cta href="/products?category=whey" primary onClick={() => track('calculator_cta', { tab: 'protein', target: 'whey' })}>
                    Browse whey
                  </Cta>
                  <Cta href="/guide/whey" onClick={() => track('calculator_cta', { tab: 'protein', target: 'guide' })}>
                    Whey guide
                  </Cta>
                </div>
              </div>
            ) : (
              <p className="mt-6 text-sm text-lab-muted">Enter your bodyweight to see your target.</p>
            )}
          </div>
        )}

        {/* CREATINE */}
        {tab === 'creatine' && (
          <div>
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                Daily dose
              </p>
              <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                3–5<span className="text-xl text-white/70 ml-1">g / day</span>
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-3">
                Creatine monohydrate, taken every day. Timing does not matter — consistency does. The
                dose is the same regardless of bodyweight.
              </p>

              <label className="flex items-center gap-3 mt-5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={loading}
                  onChange={(e) => { setLoading(e.target.checked); track('calculator_creatine_loading', { on: e.target.checked }) }}
                  className="w-4 h-4 accent-lab-lime"
                />
                <span className="text-sm text-white/90">Show optional loading phase</span>
              </label>
              {loading && (
                <p className="text-xs text-lab-muted leading-snug mt-3 pl-7">
                  Optional: <span className="text-white/80">20g/day split into 4 × 5g</span> for 5–7
                  days saturates your muscles faster. Skipping it just means full stores take 3–4 weeks
                  on the standard 3–5g.
                </p>
              )}
            </div>

            <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
              <Field label="Tub size — see how long it lasts">
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
              </Field>
              <div className="mt-4">
                <ResultRow
                  k="Lasts at 5g/day"
                  v={`${creatine.daysAt5g} days`}
                  hint="Why price per gram beats price per tub — buy the big pouch."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-5">
              <Cta href="/products?category=creatine" primary onClick={() => track('calculator_cta', { tab: 'creatine', target: 'creatine' })}>
                Browse creatine
              </Cta>
              <Cta href="/guide/creatine" onClick={() => track('calculator_cta', { tab: 'creatine', target: 'guide' })}>
                Creatine guide
              </Cta>
            </div>
          </div>
        )}

        {/* CAFFEINE */}
        {tab === 'caffeine' && (
          <div>
            {caffeine ? (
              <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                  Effective pre-workout dose
                </p>
                <p className="text-4xl font-black text-lab-lime tabular-nums leading-none mb-1">
                  {caffeine.low}–{caffeine.cappedHigh}<span className="text-xl text-white/70 ml-1">mg</span>
                </p>
                <p className="text-xs text-lab-muted leading-snug mt-3">
                  Based on 3–6mg per kg of bodyweight, the range studied for focus and perceived effort.
                  {caffeine.overCap && (
                    <span className="text-amber-400"> Your upper figure is capped at 400mg — we penalise
                      servings above that, where downsides tend to outweigh benefits.</span>
                  )}
                </p>
                <div className="mt-4 pt-3 border-t border-lab-border">
                  <ResultRow k="Pre-workout serving cap" v="≤ 400 mg" hint="Our scoring threshold — above this we mark a pre-workout down. For a sensible single acute dose, EFSA suggests ≤ 200 mg (see the caffeine calculator)." />
                  <ResultRow k="Daily ceiling (adults)" v="400 mg" hint="EFSA guidance for healthy adults, from all sources." />
                  <ResultRow k="Evening sessions" v="Go stim-free" hint="Caffeine that late can wreck your sleep." />
                </div>
                <div className="grid grid-cols-2 gap-2 mt-5">
                  <Cta href="/products?category=pre-workout" primary onClick={() => track('calculator_cta', { tab: 'caffeine', target: 'pre-workout' })}>
                    Browse pre-workout
                  </Cta>
                  <Cta href="/guide/pre-workout" onClick={() => track('calculator_cta', { tab: 'caffeine', target: 'guide' })}>
                    Pre-workout guide
                  </Cta>
                </div>
              </div>
            ) : (
              <p className="text-sm text-lab-muted">Enter your bodyweight to see your caffeine range.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
