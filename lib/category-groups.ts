export type CategoryGroup = {
  slug: string
  label: string
  tagline: string
  icon: string
  accent: string   // hex — used for subtle gradient tint on the tile
  categories: string[]
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    slug: 'protein',
    label: 'Protein',
    tagline: 'Build quality muscle',
    icon: '🥛',
    accent: '#2E8FE0',
    categories: ['whey', 'whey-isolate', 'casein'],
  },
  {
    slug: 'performance',
    label: 'Performance',
    tagline: 'Energy, focus & stamina',
    icon: '⚡',
    accent: '#F59E0B',
    categories: ['pre-workout', 'creatine'],
  },
  {
    slug: 'aminos',
    label: 'Aminos',
    tagline: 'Fuel & repair muscle',
    icon: '🔬',
    accent: '#8B5CF6',
    categories: ['eaas', 'intra-workout'],
  },
  {
    slug: 'recovery',
    label: 'Recovery',
    tagline: 'Bounce back faster',
    icon: '🔄',
    accent: '#14B8A6',
    categories: ['post-workout', 'hydration'],
  },
  {
    slug: 'support',
    label: 'Support',
    tagline: 'Cycle & hormone health',
    icon: '🛡️',
    accent: '#E05A2B',
    categories: ['cycle-support', 'hormone-support'],
  },
  {
    slug: 'on-the-go',
    label: 'On The Go',
    tagline: 'Nutrition on the move',
    icon: '🍫',
    accent: '#A6E22E',
    categories: ['protein-bar', 'meal-replacement'],
  },
  {
    slug: 'wellbeing',
    label: 'Wellbeing',
    tagline: 'Vitamins & daily health',
    icon: '💊',
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
