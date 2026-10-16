'use client'

import { useState, useEffect, useMemo, useRef, useId } from 'react'
import { hasApprovedAssessment } from '@/lib/assessment-display'
import { listedPackPence, listedPackSubtotal } from '@/lib/wizard-budget'
import Link from 'next/link'
import ProductAssessment from '@/components/ProductAssessment'
import { categoryLabel } from '@/lib/categories'
import { track } from '@/lib/gtag'
import { useLocalStack } from '@/components/LocalStackContext'
import type { ScoredProduct } from '@/lib/products'

type GoalKey = 'muscle' | 'performance' | 'health' | 'weightloss'

const GOALS: { key: GoalKey; label: string; blurb: string }[] = [
  { key: 'muscle', label: 'Build Muscle', blurb: 'Size and strength' },
  { key: 'performance', label: 'Performance', blurb: 'Train harder, recover faster' },
  { key: 'health', label: 'Health & Wellbeing', blurb: 'Fill the gaps, feel better' },
  { key: 'weightloss', label: 'Lean Out', blurb: 'Protein-led, low calorie' },
]

// Budget applies to listed packs for the initial selection. It is not monthly consumption.
const BUDGET_MIN = 20
const BUDGET_MAX = 300
const BUDGET_STEP = 10
const NO_LIMIT = BUDGET_MAX

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
  const [goals, setGoals] = useState<GoalKey[]>([])
  const [budget, setBudget] = useState<number>(120)
  const [budgetDraft, setBudgetDraft] = useState('120')
  const [hardTrainer, setHardTrainer] = useState<boolean | null>(null)
  const [owned, setOwned] = useState<string[]>([])
  const [all, setAll] = useState<ScoredProduct[]>([])
  const container = useRef<HTMLDivElement>(null)
  const previousStep = useRef(step)
  const addedStackLink = useRef<HTMLAnchorElement>(null)
  const focusAddedStack = useRef(false)
  const budgetId = useId()

  useEffect(() => {
    if (previousStep.current === step) return
    previousStep.current = step
    container.current?.querySelector<HTMLElement>('[data-wizard-step-heading]')?.focus()
  }, [step])

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
      if (!hasApprovedAssessment(p)) continue
      const cur = map.get(p.category)
      if (!cur || (p.score ?? -1) > (cur.score ?? -1)) map.set(p.category, p)
    }
    return map
  }, [all])

  // merged category priority across all selected goals (de-duped, priority order)
  const mergedCats = useMemo(() => {
    const seen = new Set<string>()
    const out: string[] = []
    for (const g of GOALS) {
      if (!goals.includes(g.key)) continue
      for (const c of GOAL_CATEGORIES[g.key]) {
        if (!seen.has(c)) { seen.add(c); out.push(c) }
      }
    }
    return out
  }, [goals])

  const stack = useMemo(() => {
    if (!goals.length) return [] as ScoredProduct[]
    let cats = mergedCats.filter((c) => !owned.includes(c))
    // hard trainers get pre-workout prioritised if available
    if (hardTrainer) {
      cats = ['pre-workout', ...cats.filter((c) => c !== 'pre-workout')]
    }
    const noLimit = budget >= NO_LIMIT
    const picks: ScoredProduct[] = []
    let total = 0
    for (const c of cats) {
      const p = topByCategory.get(c)
      if (!p) continue
      const price = listedPackPence(p.retail_price)
      // Unknown prices cannot count as free within a finite pack budget.
      if (!noLimit && (price === null || total + price > Math.round(budget * 100))) continue
      picks.push(p)
      if (price !== null) total += price
    }
    return picks
  }, [goals, budget, hardTrainer, owned, topByCategory, mergedCats])

  const stackTotal = listedPackSubtotal(stack)

  function toggleGoal(k: GoalKey) {
    setGoals((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  }

  function toggleOwned(c: string) {
    setOwned((prev) => (prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]))
  }

  // How many of the recommended picks are already in My Stack.
  const inStackCount = stack.filter((p) => inStack(p.id)).length
  const allInStack = stack.length > 0 && inStackCount === stack.length

  useEffect(() => {
    if (allInStack && focusAddedStack.current) {
      focusAddedStack.current = false
      addedStackLink.current?.focus()
    }
  }, [allInStack])

  function addAllToStack() {
    focusAddedStack.current = true
    const toAdd = stack.filter((p) => !inStack(p.id))
    toAdd.forEach((p) =>
      toggle({ id: p.id, name: p.name, brand: p.brand, category: p.category, score: p.score }),
    )
    track('wizard_add_stack', {
      goal: goals.join(','),
      budget: String(budget),
      added: toAdd.length,
    })
  }

  function next() {
    if (step === 3) track('wizard_complete', { goal: goals.join(','), budget: String(budget) })
    setStep((s) => Math.min(s + 1, 4))
  }
  function back() {
    setStep((s) => Math.max(s - 1, 0))
  }
  function restart() {
    setStep(0)
    setGoals([])
    setBudget(120)
    setBudgetDraft('120')
    setHardTrainer(null)
    setOwned([])
    focusAddedStack.current = false
  }

  const canAdvance =
    (step === 0 && goals.length > 0) ||
    step === 1 ||
    (step === 2 && hardTrainer !== null) ||
    step === 3

  return (
    <div ref={container} className="max-w-2xl mx-auto">
      <p className="mb-6 rounded-xl border border-lab-border p-4 text-sm text-lab-muted">Automatic recommendations are unavailable until product assessments are approved. Your answers cannot turn historical scores into approved recommendations. <Link href="/products" className="underline">Browse records</Link> or <Link href="/stack" className="underline">build a manual research stack</Link>.</p>
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

      {/* step 0 — goals (multi-select) */}
      {step === 0 && (
        <Step title="What are your goals?" subtitle="Pick all that apply — we'll merge the priorities.">
          <div className="grid sm:grid-cols-2 gap-3">
            {GOALS.map((g) => (
              <Choice
                key={g.key}
                active={goals.includes(g.key)}
                onClick={() => toggleGoal(g.key)}
                label={g.label}
                blurb={goals.includes(g.key) ? 'Selected ✓' : g.blurb}
              />
            ))}
          </div>
        </Step>
      )}

      {/* step 1 — budget slider */}
      {step === 1 && (
        <Step title="What is your initial pack budget?" subtitle="Choose a budget for the listed packs. Delivery is additional.">
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-6">
            <div className="text-center mb-4">
              <span className="text-4xl font-black text-lab-lime">
                {budget >= NO_LIMIT ? 'No limit' : `£${budget}`}
              </span>
              <span className="text-lab-muted text-sm">{budget >= NO_LIMIT ? '' : ' for packs'}</span>
            </div>
            <input
              type="range"
              aria-label="Initial pack budget"
              aria-valuetext={budget >= NO_LIMIT ? 'No limit' : `£${budget} for packs`}
              min={BUDGET_MIN}
              max={BUDGET_MAX}
              step={BUDGET_STEP}
              value={budget}
              onChange={(e) => {
                const value = Number(e.target.value)
                setBudget(value)
                setBudgetDraft(value >= NO_LIMIT ? '' : String(value))
              }}
              className="w-full accent-lab-lime"
            />
            <div className="flex justify-between text-[10px] uppercase tracking-widest text-lab-muted mt-2">
              <span>£{BUDGET_MIN}</span>
              <span>No limit</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <label htmlFor={budgetId} className="text-xs text-lab-muted uppercase tracking-widest font-bold shrink-0">Custom £</label>
              <input
                id={budgetId}
                aria-label="Custom initial pack budget in pounds"
                type="number"
                min={BUDGET_MIN}
                step="0.01"
                value={budgetDraft}
                placeholder="e.g. 95"
                onChange={(e) => {
                  setBudgetDraft(e.target.value)
                  const v = Number(e.target.value)
                  if (Number.isFinite(v) && v >= BUDGET_MIN) setBudget(Math.round(Math.min(v, NO_LIMIT) * 100) / 100)
                }}
                onBlur={() => {
                  const value = Number(budgetDraft)
                  const nextBudget = budgetDraft.trim() && Number.isFinite(value) && value > 0
                    ? Math.round(Math.min(Math.max(value, BUDGET_MIN), NO_LIMIT) * 100) / 100
                    : budget
                  setBudget(nextBudget)
                  setBudgetDraft(nextBudget >= NO_LIMIT ? '' : String(nextBudget))
                }}
                className="w-28 bg-lab-bg text-white border border-lab-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-lab-lime"
              />
            </div>
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
          <h2 tabIndex={-1} data-wizard-step-heading className="text-2xl font-black uppercase tracking-tight mb-2">
            {stack.length} product{stack.length === 1 ? '' : 's'} for{' '}
            <span className="text-lab-lime">
              {GOALS.filter((g) => goals.includes(g.key)).map((g) => g.label).join(' + ') || 'your goals'}
            </span>
          </h2>
          <p className="text-lab-muted text-sm mb-2">
            {stackTotal !== null && stack.length > 0
              ? <>Listed pack subtotal: <span className="text-white font-bold">£{(stackTotal / 100).toFixed(2)}</span>.</>
              : 'A complete pack subtotal is unavailable for this selection.'}
            {' '}Delivery and checkout adjustments are additional.
          </p>
          <p className="text-lab-muted text-sm mb-6">
            Monthly spending needs the pack contents and how often each product is used.
            Review each product&apos;s evidence and label before adding it to your stack.
          </p>

          {stack.length === 0 ? (
            <p className="text-lab-muted text-sm">
              Recommendations are unavailable because no product assessment has been approved. Changing goals or budget cannot turn an unverified score into a recommendation. Browse product records to build a manual research stack.
            </p>
          ) : (
            <div className="space-y-3">
              {stack.map((p) => (
                <div
                  key={p.id}
                  className="grid grid-cols-[auto_minmax(0,1fr)] sm:grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-lab-panel border border-lab-border rounded-xl p-4"
                >
                  <ProductAssessment product={p} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-bold break-words">{p.brand}</p>
                    <Link href={`/products/${p.id}`} className="text-lab-muted text-xs break-words hover:text-lab-lime hover:underline">{p.name}</Link>
                    <span className="inline-block mt-1.5 text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                      {categoryLabel(p.category)}
                    </span>
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => toggle({ id: p.id, name: p.name, brand: p.brand, category: p.category, score: p.score })}
                      className={`text-[10px] uppercase tracking-widest font-bold px-3 min-h-11 rounded-lg border transition-colors ${
                        inStack(p.id)
                          ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                          : 'border-lab-border text-lab-muted hover:text-white'
                      }`}
                    >
                      {inStack(p.id) ? '✓ Stack' : '+ Stack'}
                    </button>
                    <Link
                      href={`/products?category=${p.category}`}
                      className="text-[10px] uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-3 min-h-11 inline-flex items-center rounded-lg"
                    >
                      Browse alternatives
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
                  ref={addedStackLink}
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
      <h2 tabIndex={-1} data-wizard-step-heading className="text-2xl font-black uppercase tracking-tight mb-1">{title}</h2>
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
      type="button"
      aria-pressed={active}
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
