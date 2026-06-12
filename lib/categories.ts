// Category metadata for browse nav + labels. Slugs match the Supabase `category` column.
export type Category = { slug: string; label: string }

// Ordered for the browse nav. `all` is handled separately in the UI.
export const CATEGORIES: Category[] = [
  { slug: 'whey', label: 'Whey' },
  { slug: 'whey-isolate', label: 'Whey Isolate' },
  { slug: 'casein', label: 'Casein' },
  { slug: 'creatine', label: 'Creatine' },
  { slug: 'pre-workout', label: 'Pre-Workout' },
  { slug: 'eaas', label: 'EAAs' },
  { slug: 'intra-workout', label: 'Intra-Workout' },
  { slug: 'post-workout', label: 'Post-Workout' },
  { slug: 'hydration', label: 'Hydration' },
  { slug: 'cycle-support', label: 'Cycle Support' },
  { slug: 'protein-bar', label: 'Protein Bars' },
  { slug: 'meal-replacement', label: 'Meal Replacement' },
  { slug: 'vitamin', label: 'Vitamins' },
  { slug: 'multivitamin', label: 'Multivitamins' },
  { slug: 'vitamin-d', label: 'Vitamin D' },
  { slug: 'zma', label: 'ZMA' },
  { slug: 'hormone-support', label: 'Hormone Support' },
  { slug: 'gut-digestion', label: 'Gut & Digestion' },
  { slug: 'heart-health', label: 'Heart Health' },
  { slug: 'liver-health', label: 'Liver Health' },
  { slug: 'omega-3', label: 'Omega-3' },
  { slug: 'joint-health', label: 'Joint Health' },
  { slug: 'vitamin-c', label: 'Vitamin C' },
  { slug: 'magnesium', label: 'Magnesium' },
  { slug: 'sleep-recovery', label: 'Sleep & Recovery' },
]

const LABEL_BY_SLUG: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.label])
)

export function categoryLabel(slug: string): string {
  return LABEL_BY_SLUG[slug] || slug
}
