import type { Nutrient, Product } from '@/lib/products'

export type PreviewProduct = Product & { nutrients: Nutrient[] }

// Read-only visual-preview records copied from the 15 September catalogue
// reconciliation snapshot. Offers are deliberately removed: this data exists
// only so the local design can be reviewed without a database or checkout.
// Images use bundled exact-ID files; missing files retain the honest fallback.
export const PREVIEW_PRODUCTS: PreviewProduct[] = [
  {
    id: '99e438ca-067d-40c5-81f7-f1a26827551a', name: 'Pure Creatine Monohydrate Powder', brand: 'Nutrition Geeks', category: 'creatine',
    serving_size: 3.5, serving_unit: 'g', servings_per_container: 90, retail_price: 9.99, image_url: '/catalogue/99e438ca-067d-40c5-81f7-f1a26827551a.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Creatine Monohydrate', amount: 3500, unit: 'mg' }],
  },
  {
    id: '1b11e65b-cdff-4d12-835a-4c9c5ab9bac8', name: 'Creatine Monohydrate', brand: 'Darkstims', category: 'creatine',
    serving_size: 5, serving_unit: 'g', servings_per_container: 100, retail_price: 18, image_url: '/catalogue/1b11e65b-cdff-4d12-835a-4c9c5ab9bac8.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Creatine Monohydrate', amount: 5000, unit: 'mg' }],
  },
  {
    id: '4ea5c8df-7506-42e0-8e77-92775940ae78', name: 'Pharma Whey', brand: 'PhD Nutrition', category: 'whey',
    serving_size: 30, serving_unit: 'scoop', servings_per_container: 75, retail_price: 44.99, image_url: null,
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: 80,
    nutrients: [{ nutrient_name: 'Protein', amount: 24, unit: 'g' }],
  },
  {
    id: '9d3105e7-1760-4da8-ad22-f432114b3ea7', name: '100% Whey', brand: 'Reflex Nutrition', category: 'whey',
    serving_size: 30, serving_unit: 'scoop', servings_per_container: 66, retail_price: 44.99, image_url: '/catalogue/9d3105e7-1760-4da8-ad22-f432114b3ea7.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: 80,
    nutrients: [{ nutrient_name: 'Protein', amount: 24, unit: 'g' }],
  },
  {
    id: '8900fc28-fd3f-4338-9dfe-2257631c2931', name: 'PRE V4', brand: 'Darkstims', category: 'pre-workout',
    serving_size: 20, serving_unit: 'g', servings_per_container: 25, retail_price: 35, image_url: '/catalogue/8900fc28-fd3f-4338-9dfe-2257631c2931.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'L-Theanine', amount: 200, unit: 'mg' }, { nutrient_name: 'L-Tyrosine', amount: 2000, unit: 'mg' }, { nutrient_name: 'L-Citrulline', amount: 8000, unit: 'mg' }, { nutrient_name: 'Beta-Alanine', amount: 3500, unit: 'mg' }, { nutrient_name: 'Caffeine', amount: 400, unit: 'mg' }],
  },
  {
    id: 'dbb9f5ab-76ae-423a-90c0-7455bec4e3f7', name: 'LMNT Recharge', brand: 'LMNT', category: 'hydration',
    serving_size: 6, serving_unit: 'serving', servings_per_container: 30, retail_price: 39, image_url: '/catalogue/dbb9f5ab-76ae-423a-90c0-7455bec4e3f7.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Sodium', amount: 1000, unit: 'mg' }, { nutrient_name: 'Potassium', amount: 200, unit: 'mg' }, { nutrient_name: 'Magnesium', amount: 60, unit: 'mg' }, { nutrient_name: 'Sugar', amount: 0, unit: 'g' }],
  },
  {
    id: 'e454733a-a69b-4cb6-950c-d01739a9d3a9', name: 'PH 1000', brand: 'Precision Hydration', category: 'hydration',
    serving_size: 4.5, serving_unit: 'serving', servings_per_container: 30, retail_price: 19.99, image_url: '/catalogue/e454733a-a69b-4cb6-950c-d01739a9d3a9.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Sodium', amount: 1000, unit: 'mg' }, { nutrient_name: 'Potassium', amount: 200, unit: 'mg' }, { nutrient_name: 'Magnesium', amount: 60, unit: 'mg' }, { nutrient_name: 'Sugar', amount: 2, unit: 'g' }],
  },
  {
    id: 'e4fd101e-4969-4054-92ab-f02d4cb3d494', name: 'Layered Protein Bar (Salted Caramel)', brand: 'Myprotein', category: 'protein-bar',
    serving_size: 60, serving_unit: 'bar', servings_per_container: 1, retail_price: 1.8, image_url: null,
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Protein', amount: 20, unit: 'g' }, { nutrient_name: 'Carbohydrates', amount: 17, unit: 'g' }, { nutrient_name: 'Fat', amount: 7.5, unit: 'g' }, { nutrient_name: 'Fibre', amount: 7.9, unit: 'g' }, { nutrient_name: 'Sugar', amount: 2.6, unit: 'g' }],
  },
  {
    id: '04cd9fc1-86e5-4ceb-a5ef-7229f15ee4dc', name: 'Magnesium Bisglycinate', brand: 'Bulk', category: 'magnesium',
    serving_size: 4, serving_unit: 'capsule', servings_per_container: 60, retail_price: 14.99, image_url: null,
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Magnesium', amount: 500, unit: 'mg' }],
  },
  {
    id: '8a094502-214c-4d47-8011-a812f4232d19', name: 'Vitamin D3 4000 IU Spray', brand: 'BetterYou', category: 'vitamin-d',
    serving_size: 1, serving_unit: 'spray', servings_per_container: 100, retail_price: 9.95, image_url: '/catalogue/8a094502-214c-4d47-8011-a812f4232d19.png',
    informed_sport: false, buy_url: null, proprietary_blend: false, amino_spiked: false, protein_yield: null,
    nutrients: [{ nutrient_name: 'Vitamin D3', amount: 100, unit: 'mcg' }],
  },
]
