export type CategoryGroup = {
  slug: string
  label: string
  tagline: string
  icon: string       // kept for fallback
  iconSvg: string    // SVG path innerHTML for the neon line icon
  accent: string     // hex — used for subtle gradient tint on the tile
  categories: string[]
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    slug: 'protein',
    label: 'Protein',
    tagline: 'Build quality muscle',
    icon: '🥛',
    iconSvg: '<path d="M7 8h10l-1 12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1L7 8zM6 8h12M9 4h6v4H9z"/>',
    accent: '#2E8FE0',
    categories: ['whey', 'whey-isolate', 'casein'],
  },
  {
    slug: 'performance',
    label: 'Performance',
    tagline: 'Energy, focus & stamina',
    icon: '⚡',
    iconSvg: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>',
    accent: '#F59E0B',
    categories: ['pre-workout', 'creatine'],
  },
  {
    slug: 'aminos',
    label: 'Aminos',
    tagline: 'Fuel & repair muscle',
    icon: '🔬',
    iconSvg: '<circle cx="6" cy="6" r="2.2"/><circle cx="18" cy="9" r="2.2"/><circle cx="9" cy="18" r="2.2"/><path d="M8 7l8 1M8 8l1 8"/>',
    accent: '#8B5CF6',
    categories: ['eaas', 'intra-workout'],
  },
  {
    slug: 'recovery',
    label: 'Recovery',
    tagline: 'Bounce back faster',
    icon: '🔄',
    iconSvg: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    accent: '#14B8A6',
    categories: ['post-workout', 'hydration'],
  },
  {
    slug: 'support',
    label: 'Support',
    tagline: 'Cycle & hormone health',
    icon: '🛡️',
    iconSvg: '<path d="M12 3l7 3v6c0 5-3 7-7 9-4-2-7-4-7-9V6l7-3z"/>',
    accent: '#E05A2B',
    categories: ['cycle-support', 'hormone-support'],
  },
  {
    slug: 'on-the-go',
    label: 'On The Go',
    tagline: 'Nutrition on the move',
    icon: '🍫',
    iconSvg: '<path d="M5 9l4-4 10 10-4 4L5 9zM9 5l10 10M7 7l2 2"/>',
    accent: '#A6E22E',
    categories: ['protein-bar', 'meal-replacement'],
  },
  {
    slug: 'wellbeing',
    label: 'Wellbeing',
    tagline: 'Vitamins & daily health',
    icon: '💊',
    iconSvg: '<path d="M8 8l8 8a4 4 0 0 1-6 6l-8-8a4 4 0 0 1 6-6zM13 3l8 8a4 4 0 0 1-6 6"/>',
    accent: '#20B978',
    categories: [
      'vitamin',
      'multivitamin',
      'vitamin-d',
      'vitamin-c',
      'gut-digestion',
      'heart-health',
      'liver-health',
      'omega-3',
      'joint-health',
      'magnesium',
      'sleep-recovery',
      'zma',
    ],
  },
]
