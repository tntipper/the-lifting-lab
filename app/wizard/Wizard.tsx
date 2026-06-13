'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import { useLocalStack } from '@/components/LocalStackContext'
import type { ScoredProduct } from '@/lib/products'

type GoalKey = 'muscle' | 'performance' | 'health' | 'weightloss'
type BudgetKey = 'lean' | 'mid' | 'open'

const GOALS: { key: GoalKey; label: string; blurb: string }[] = [
  { key: 'muscle', label: 'Build Muscle', blurb: 'Size and strength' },
  { key: 'performance', label: 'Performance', blurb: 'Train harder, recover faster' },
  { key: 'health', label: 'Health & Wellbeing', blurb: 'Fill the gaps, feel better' },
  { key: 'weightloss', label: 'Lean Out', blurb: 'Protein-led, low calorie' },
]

const BUDGETS: { key: BudgetKey; label: string; blurb: string; max: number }[] = [
  { key: 'lean', label: 'Under £80', blurb: 'The essentials only', max: 2 },
  { key: 'mid', label: '£80 – £150', blurb: 'A complete core stack', max: 4 },
  { key: 'open', label: 'No limit', blurb: 'The full optimised stack', max: 6 },
]

// Goal -> ordered category priority. We pick the highest-scored product in each,
// trimmed to the budget tier's max number of products.
const GOAL_CATEGORIES: Record<GoalKey, string[]> = {
  muscle: ['whey', 'creatine', 'eaas', 'whey-isolate', 'pre-workout', 'casein'],
  performance: ['creatine', 'pre-workout', 'eaas', 'hydration', 'whey', 'casein'],
  health: ['vitamin', 'vitamin-d', 'hormone-support', 'gut-digestion', 'zma', 'whey'],
  weightloss: ['whey-isolate', 'eaas', 'hydration', 'protein-bar', 'creatine', 'vitamin'],
}

// Categories the user can flag as "already taking" to exclude from the stack.
const OWN_OPTIONS = ['whey', 'creatine', 'pre-workout', 'eaas', 'vitamin', 'hydration']

export default function Wizard() {
  const { inStack, toggle } = useLocalStack()
  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<GoalKey | null>(null)
  const [budget, setBudget] = useState<BudgetKey | null>(null)
  const [hardTrainer, setHardTrainer] = useState<boolean | null>(null)
  const [owned, setOwned] = useState<string[]>([])
  const [all, setAll] = useState<ScoredProduct[]>([])

  useEffect(() => {
    track('wizard_start')
    fetch('/api/products?sort=score')
      .then((r) => r.json())
      .then((d) => setAll(Array.isArray(d) ? d : []))
      .catch(() => setAll([]))
  }, [])

  // best (highest-scored) product per category
  const topByCategory = useMemo(() => {
    const map = new Map<string, ScoredProduct>()
    for (const p of all) {
      const cur = map.get(p.category)
      if (!cur || (p.score ?? -1) > (cur.score ?? -1)) map.set(p.category, p)
    }
    return map
  }, [all])

  const stack = useMemo(() => {
    if (!goal || !budget) return [] as ScoredProduct[]
    const tier = BUDGETS.find((b) => b.key === budget)!
    let cats = GOAL_CATEGORIES[goal].filter((c) => !owned.includes(c))
    // hard trainers get pre-workout / intra prioritised if available
    if (hardTrainer) {
      cats = ['pre-workout', ...cats.filter((c) => c !== 'pre-workout')]
    }
    const picks: ScoredProduct[] = []
    for (const c of cats) {
      const p = topByCategory.get(c)
      if (p) picks.push(p)
      if (picks.length >= tier.max) break
    }
    return picks
  }, [goal, budget, hardTrainer, owned, topByCategory])

  function toggleOwned(c: string) {
    setOwned((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  // How many of the recommended picks are already in My Stack.
  const inStackCount = stack.filter((p) => inStack(p.id)).length
  const allInStack = stack.length > 0 && inStackCount === stack.length

  function addAllToStack() {
    const toAdd = stack.filter((p) => !inStack(p.id))
    toAdd.forEach((p) =>
      toggle({ id: p.id, name: p.name, brand: p.brand, category: p.category, score: p.score }),
    )
    track('wizard_add_stack', {
      goal: goal || '',
      budget: budget || '',
      added: toAdd.length,
    })
  }

  function next() {
    if (step === 3) track('wizard_complete', { goal: goal || '', budget: budget || '' })
    setStep((s) => Math.min(s + 1, 4))
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0))
  }
  function restart() {
    setStep(0)
    setGoal(null)
    setBudget(null)
    setHardTrainer(null)
    setOwned([])
  }

  const canAdvance =
    (step === 0 && goal) ||
    (step === 1 && budget) ||
    (step === 2 && hardTrainer !== null) ||
    step === 3

  return (
    <div className="max-w-2xl mx-auto">
      {/* progress */}
      {step < 4 && (
        <div className="flex gap-1.5 mb-8">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={`h-1 flex-1 rounded-full ${i <= step ? 'bg-lab-lime' : 'bg-lab-border'}`}
            />
          ))}
        </div>
      )}

      {/* step 0 — goal */}
      {step === 0 && (
        <Step title="What's the goal?" subtitle="Pick the one that fits best.">
          <div className="grid sm:grid-cols-2 gap-3">
            {GOALS.map((g) => (
              <Choice
                key={g.key}
                active={goal === g.key}
                onClick={() => setGoal(g.key)}
                label={g.label}
                blurb={g.blurb}
              />
            ))}
          </div>
        </Step>
      )}

      {/* step 1 — budget */}
      {step === 1 && (
        <Step title="What's your budget?" subtitle="Monthly spend on supplements.">
          <div className="space-y-3">
            {BUDGETS.map((b) => (
              <Choice
                key={b.key}
                active={budget === b.key}
                onClick={() => setBudget(b.key)}
                label={b.label}
                blurb={b.blurb}
              />
            ))}
          </div>
        </Step>
      )}

      {/* step 2 — training */}
      {step === 2 && (
        <Step title="How hard do you train?" subtitle="This tilts the stack towards performance.">
          <div className="grid sm:grid-cols-2 gap-3">
            <Choice
              active={hardTrainer === true}
              onClick={() => setHardTrainer(true)}
              label="4+ sessions a week"
              blurb="Serious training load"
            />
            <Choice
              active={hardTrainer === false}
              onClick={() => setHardTrainer(false)}
              label="1–3 sessions a week"
              blurb="Keeping ticking over"
            />
          </div>
        </Step>
      )}

      {/* step 3 — already taking */}
      {step === 3 && (
        <Step title="Already taking any of these?" subtitle="We'll leave them out of your stack. Optional.">
          <div className="grid sm:grid-cols-2 gap-3">
            {OWN_OPTIONS.map((c) => (
              <Choice
                key={c}
                active={owned.includes(c)}
                onClick={() => toggleOwned(c)}
                label={categoryLabel(c)}
                blurb={owned.includes(c) ? 'Already taking' : 'Tap to flag'}
              />
            ))}
          </div>
        </Step>
      )}

      {/* step 4 — results */}
      {step === 4 && (
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-3">
            Your stack
          </p>
          <h2 className="text-2xl font-black uppercase tracking-tight mb-2">
            {stack.length} product{stack.length === 1 ? '' : 's'} for{' '}
            <span className="text-lab-lime">{GOALS.find((g) => g.key === goal)?.label}</span>
          </h2>
          <p className="text-lab-muted text-sm mb-6">
            Highest-scored pick in each recommended category, trimmed to your budget.
          </p>

          {stack.length === 0 ? (
            <p className="text-lab-muted text-sm">
              No products available for this combination yet. Try a different goal.
            </p>
          ) : (
            <div className="space-y-3">
              {stack.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4"
                >
                  <ScoreBadge score={p.score} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-bold truncate">{p.brand}</p>
                    <p className="text-lab-muted text-xs truncate">{p.name}</p>
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                      {categoryLabel(p.category)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => toggle({ id: p.id, name: p.name, brand: p.brand, category: p.category, score: p.score })}
                      className={`text-[10px] uppercase tracking-widest font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                        inStack(p.id)
                          ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                          : 'border-lab-border text-lab-muted hover:text-white'
                      }`}
                    >
                      {inStack(p.id) ? '✓ Stack' : '+ Stack'}
                    </button>
                    <Link
                      href={`/products?category=${p.category}`}
                      className="text-[10px] uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-3 py-1.5 rounded-lg"
                    >
                      Swap
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-3 mt-8">
            {stack.length > 0 && (
              allInStack ? (
                <Link
                  href="/stack"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  View My Stack →
                </Link>
              ) : (
                <button
                  onClick={addAllToStack}
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  {inStackCount > 0
                    ? `Add ${stack.length - inStackCount} more to My Stack`
                    : `Add ${stack.length} to My Stack`}
                </button>
              )
            )}
            <Link
              href="/products"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg"
            >
              Browse all →
            </Link>
            <button
              onClick={restart}
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg"
            >
              Start over
            </button>
          </div>
        </div>
      )}

      {/* nav */}
      {step < 4 && (
        <div className="flex items-center justify-between mt-10">
          <button
            onClick={back}
            disabled={step === 0}
            className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white disabled:opacity-30"
          >
            ← Back
          </button>
          <button
            onClick={next}
            disabled={!canAdvance}
            className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-6 py-2.5 rounded-lg hover:opacity-90 disabled:opacity-30"
          >
            {step === 3 ? 'See my stack →' : 'Next →'}
          </button>
        </div>
      )}
    </div>
  )
}

function Step({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div>
      <h2 className="text-2xl font-black uppercase tracking-tight mb-1">{title}</h2>
      <p className="text-lab-muted text-sm mb-6">{subtitle}</p>
      {children}
    </div>
  )
}

function Choice({
  active,
  onClick,
  label,
  blurb,
}: {
  active: boolean
  onClick: () => void
  label: string
  blurb: string
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-4 border transition-colors ${
        active ? 'border-lab-lime bg-lab-lime/10' : 'border-lab-border bg-lab-panel hover:border-lab-muted'
      }`}
    >
      <p className={`text-sm font-bold ${active ? 'text-lab-lime' : 'text-white'}`}>{label}</p>
      <p className="text-lab-muted text-xs mt-0.5">{blurb}</p>
    </button>
  )
}
