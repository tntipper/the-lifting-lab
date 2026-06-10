// Run with: npx tsx scripts/seed-products.ts
// Seeds 5 demo products into Supabase

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://wrhgscovsgsudtedbljr.supabase.co',
  process.env.SUPABASE_SERVICE_KEY!
)

const products = [
  {
    name: 'Gold Standard 100% Whey',
    brand: 'Optimum Nutrition',
    category: 'whey',
    serving_size: 30.4,
    serving_unit: 'g',
    servings_per_container: 74,
    source: 'tll_reviewed',
    status: 'active',
    nutrients: [
      { nutrient_name: 'Protein', amount: 24, unit: 'g' },
      { nutrient_name: 'Calories', amount: 120, unit: 'kcal' },
      { nutrient_name: 'Carbohydrates', amount: 3, unit: 'g' },
      { nutrient_name: 'Fat', amount: 1.5, unit: 'g' },
    ]
  },
  {
    name: 'ABE All Black Everything Pre-Workout',
    brand: 'Applied Nutrition',
    category: 'pre-workout',
    serving_size: 15,
    serving_unit: 'g',
    servings_per_container: 30,
    source: 'tll_reviewed',
    status: 'active',
    nutrients: [
      { nutrient_name: 'Caffeine', amount: 200, unit: 'mg' },
      { nutrient_name: 'Vitamin B6', amount: 5, unit: 'mg' },
      { nutrient_name: 'Vitamin B12', amount: 10, unit: 'mcg' },
      { nutrient_name: 'Citrulline Malate', amount: 4000, unit: 'mg' },
      { nutrient_name: 'Beta-Alanine', amount: 1600, unit: 'mg' },
    ]
  },
  {
    name: 'Complete Daily Multivitamin',
    brand: 'MyProtein',
    category: 'multivitamin',
    serving_size: 1,
    serving_unit: 'tablet',
    servings_per_container: 90,
    source: 'tll_reviewed',
    status: 'active',
    nutrients: [
      { nutrient_name: 'Vitamin A', amount: 800, unit: 'mcg' },
      { nutrient_name: 'Vitamin C', amount: 80, unit: 'mg' },
      { nutrient_name: 'Vitamin D3', amount: 5, unit: 'mcg' },
      { nutrient_name: 'Vitamin E', amount: 12, unit: 'mg' },
      { nutrient_name: 'Vitamin B6', amount: 1.4, unit: 'mg' },
      { nutrient_name: 'Vitamin B12', amount: 2.5, unit: 'mcg' },
      { nutrient_name: 'Zinc', amount: 10, unit: 'mg' },
      { nutrient_name: 'Magnesium', amount: 100, unit: 'mg' },
      { nutrient_name: 'Iron', amount: 14, unit: 'mg' },
      { nutrient_name: 'Selenium', amount: 55, unit: 'mcg' },
    ]
  },
  {
    name: 'Vitamin D3 4000 IU Spray',
    brand: 'BetterYou',
    category: 'vitamin-d',
    serving_size: 1,
    serving_unit: 'spray',
    servings_per_container: 100,
    source: 'tll_reviewed',
    status: 'active',
    nutrients: [
      { nutrient_name: 'Vitamin D3', amount: 100, unit: 'mcg' },
    ]
  },
  {
    name: 'ZMA Zinc Magnesium',
    brand: 'Bulk',
    category: 'zma',
    serving_size: 3,
    serving_unit: 'capsule',
    servings_per_container: 90,
    source: 'tll_reviewed',
    status: 'active',
    nutrients: [
      { nutrient_name: 'Zinc', amount: 15, unit: 'mg' },
      { nutrient_name: 'Magnesium', amount: 250, unit: 'mg' },
      { nutrient_name: 'Vitamin B6', amount: 10, unit: 'mg' },
    ]
  }
]

async function seed() {
  console.log('Seeding products...')

  for (const product of products) {
    const { nutrients, ...productData } = product

    const { data, error } = await supabase
      .from('products')
      .insert(productData)
      .select('id')
      .single()

    if (error) {
      console.error(`Failed to insert ${product.name}:`, error.message)
      continue
    }

    const nutrientRows = nutrients.map(n => ({ ...n, product_id: data.id }))
    const { error: nutrientError } = await supabase
      .from('product_nutrients')
      .insert(nutrientRows)

    if (nutrientError) {
      console.error(`Failed to insert nutrients for ${product.name}:`, nutrientError.message)
    } else {
      console.log(`✓ ${product.brand} ${product.name}`)
    }
  }

  console.log('Done.')
}

seed()
