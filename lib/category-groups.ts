export type CategoryGroup = {
  slug: string
  label: string
  icon: string
  categories: string[]
}

export const CATEGORY_GROUPS: CategoryGroup[] = [
  {
    slug: 'protein',
    label: 'Protein',
    icon: '🥛',
    categories: ['whey', 'whey-isolate', 'casein'],
  },
  {
    slug: 'performance',
    label: 'Performance',
    icon: '⚡',
    categories: ['pre-workout', 'creatine'],
  },
  {
    slug: 'aminos',
    label: 'Aminos',
    icon: '🔬',
    categories: ['eaas', 'intra-workout'],
  },
  {
    slug: 'recovery',
    label: 'Recovery',
    icon: '🔄',
    categories: ['post-workout', 'hydration'],
  },
  {
    slug: 'support',
    label: 'Support',
    icon: '🛡️',
    categories: ['cycle-support', 'hormone-support'],
  },
  {
    slug: 'on-the-go',
    label: 'On The Go',
    icon: '🍫',
    categories: ['protein-bar', 'meal-replacement'],
  },
  {
    slug: 'wellbeing',
    label: 'Wellbeing',
    icon: '💊',
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
