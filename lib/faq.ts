// Aggregates every vetted Q&A already authored across the ingredient library
// (lib/ingredients.ts) and the category buyer's guides (lib/guides.ts) into a
// single themed, browsable Answers hub at /faq.
//
// The site emits per-page FAQPage schema on ~30 ingredient/guide pages but had
// NO central question surface for the huge informational query class ("how much
// creatine", "when to take whey", "is pre-workout safe"). This reuses only
// content that already ships elsewhere (zero new claims), and every answer links
// back to its source page for depth — so the hub is a genuine navigation layer,
// not fabricated doorway copy.

import { GUIDES, type Guide } from '@/lib/guides'
import { INGREDIENTS, type Ingredient } from '@/lib/ingredients'

export type FaqItem = {
  q: string
  a: string
  sourceHref: string
  sourceLabel: string
}

export type FaqTopic = {
  key: string
  title: string
  blurb: string
  items: FaqItem[]
}

// Each theme claims a set of guide slugs and ingredient slugs. Every guide (18)
// and ingredient (15) is assigned exactly once, so nothing is dropped.
type ThemeDef = {
  key: string
  title: string
  blurb: string
  guides: string[]
  ingredients: string[]
}

const THEMES: ThemeDef[] = [
  {
    key: 'protein',
    title: 'Protein & Amino Acids',
    blurb: 'How much protein you need, whey vs isolate vs casein, EAAs, bars and spotting a dodgy label.',
    guides: ['whey', 'whey-isolate', 'casein', 'eaas', 'protein-bar', 'meal-replacement'],
    ingredients: ['whey-protein', 'leucine'],
  },
  {
    key: 'creatine',
    title: 'Creatine',
    blurb: 'Dosing, loading, monohydrate vs the fancy forms, and whether Creapure is worth it.',
    guides: ['creatine'],
    ingredients: ['creatine-monohydrate'],
  },
  {
    key: 'pre-workout',
    title: 'Pre-Workout & Performance',
    blurb: 'Caffeine, pump and focus ingredients, the doses that actually work, and the tingles.',
    guides: ['pre-workout', 'intra-workout', 'post-workout'],
    ingredients: ['caffeine', 'l-citrulline', 'beta-alanine', 'l-theanine', 'betaine-anhydrous', 'taurine', 'l-tyrosine'],
  },
  {
    key: 'hydration',
    title: 'Hydration & Electrolytes',
    blurb: 'Why sodium is the ingredient that matters and when a hydration product is worth it.',
    guides: ['hydration'],
    ingredients: ['electrolytes'],
  },
  {
    key: 'vitamins',
    title: 'Vitamins, Minerals & Health',
    blurb: 'Vitamin D, magnesium, zinc, multivitamins, ZMA and gut health, with sensible UK doses.',
    guides: ['vitamin', 'multivitamin', 'vitamin-d', 'zma', 'gut-digestion'],
    ingredients: ['magnesium', 'zinc', 'vitamin-d3'],
  },
  {
    key: 'hormone-support',
    title: 'Hormone & Recovery Support',
    blurb: 'What test-support and cycle-support products can and cannot do, and when to see a clinician.',
    guides: ['hormone-support', 'cycle-support'],
    ingredients: ['ashwagandha'],
  },
]

const GUIDE_BY_SLUG: Record<string, Guide> = Object.fromEntries(GUIDES.map((g) => [g.slug, g]))
const INGREDIENT_BY_SLUG: Record<string, Ingredient> = Object.fromEntries(INGREDIENTS.map((i) => [i.slug, i]))

// A guide h1 like "Whey Protein: How to Choose a UK Whey Powder" → "Whey Protein".
function guideLabel(g: Guide): string {
  return g.h1.split(/[:—]/)[0].trim()
}

// Collapse near-identical questions (case, trailing punctuation, whitespace) so
// the creatine guide and the creatine ingredient don't both list the same Q.
function normalise(q: string): string {
  return q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

export function buildFaqTopics(): FaqTopic[] {
  return THEMES.map((theme) => {
    const items: FaqItem[] = []
    const seen = new Set<string>()

    const push = (q: string, a: string, sourceHref: string, sourceLabel: string) => {
      const key = normalise(q)
      if (seen.has(key)) return
      seen.add(key)
      items.push({ q, a, sourceHref, sourceLabel })
    }

    for (const slug of theme.guides) {
      const g = GUIDE_BY_SLUG[slug]
      if (!g) continue
      for (const f of g.faqs) push(f.q, f.a, `/guide/${g.slug}`, guideLabel(g))
    }
    for (const slug of theme.ingredients) {
      const ing = INGREDIENT_BY_SLUG[slug]
      if (!ing) continue
      for (const f of ing.faqs) push(f.q, f.a, `/ingredients/${ing.slug}`, ing.name)
    }

    return { key: theme.key, title: theme.title, blurb: theme.blurb, items }
  }).filter((t) => t.items.length > 0)
}

export function faqTotalCount(topics: FaqTopic[]): number {
  return topics.reduce((n, t) => n + t.items.length, 0)
}
