import type { MetadataRoute } from 'next'
import { GUIDE_SLUGS } from '@/lib/guides'
import { INGREDIENT_SLUGS } from '@/lib/ingredients'
import { INGREDIENT_MATCHUP_SLUGS } from '@/lib/ingredient-matchups'
import { STACK_SLUGS } from '@/lib/stacks'
import { createPublicClient } from '@/lib/supabase-public'
import { brandSlug } from '@/lib/brands'
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { curatedMatchups, productSlug } from '@/lib/matchups'
import { buildBrandStats, curatedBrandMatchups } from '@/lib/brand-matchups'
import { rankedCategorySlugs } from '@/lib/best-categories'
import { curatedAlternativeTargets } from '@/lib/alternatives'

const BASE = 'https://www.theliftinglab.co.uk'

// Refresh daily so newly added/removed products flow into the sitemap.
export const revalidate = 86400

async function productEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select('id').eq('status', 'active')
    if (error || !data) return []
    return (data as { id: string }[]).map((p) => ({
      url: `${BASE}/products/${p.id}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

async function brandEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select('brand').eq('status', 'active')
    if (error || !data) return []
    const slugs = new Set<string>()
    for (const row of data as { brand: string | null }[]) {
      if (row.brand && row.brand.trim()) slugs.add(brandSlug(row.brand))
    }
    return Array.from(slugs).map((slug) => ({
      url: `${BASE}/brand/${slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    }))
  } catch {
    return []
  }
}

async function matchupEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map((p) => {
      const s = withScore(p)
      return { id: p.id, name: p.name, brand: p.brand, category: p.category, score: s.score }
    })
    return curatedMatchups(scored).map((m) => ({
      url: `${BASE}/vs/${m.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

async function brandMatchupEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    return curatedBrandMatchups(buildBrandStats(scored)).map((m) => ({
      url: `${BASE}/brands-vs/${m.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

async function alternativeEntries(now: Date): Promise<MetadataRoute.Sitemap> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    return curatedAlternativeTargets(scored).map((t) => ({
      url: `${BASE}/alternatives/${productSlug(t.brand, t.name)}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    }))
  } catch {
    return []
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date()

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${BASE}/`, lastModified: now, changeFrequency: 'weekly', priority: 1 },
    { url: `${BASE}/products`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${BASE}/best`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/value`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/cheapest`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/protein-value`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/strongest-pre-workout`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/brand`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/vs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/brands-vs`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/alternatives`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/stacks`, lastModified: now, changeFrequency: 'weekly', priority: 0.9 },
    { url: `${BASE}/wizard`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/calculators`, lastModified: now, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/calculators/protein`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/creatine`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/1rm`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/plate`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/tdee`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/dots`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/body-fat`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/ffmi`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/calculators/bmi`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/compare`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/guide`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/ingredients`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE}/ingredients-vs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/faq`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE}/methodology`, lastModified: now, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/watch-outs`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  const guidePages: MetadataRoute.Sitemap = GUIDE_SLUGS.map((slug) => ({
    url: `${BASE}/guide/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const ingredientPages: MetadataRoute.Sitemap = INGREDIENT_SLUGS.map((slug) => ({
    url: `${BASE}/ingredients/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.7,
  }))

  const stackPages: MetadataRoute.Sitemap = STACK_SLUGS.map((slug) => ({
    url: `${BASE}/stacks/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  const ingredientMatchupPages: MetadataRoute.Sitemap = INGREDIENT_MATCHUP_SLUGS.map((slug) => ({
    url: `${BASE}/ingredients-vs/${slug}`,
    lastModified: now,
    changeFrequency: 'monthly',
    priority: 0.6,
  }))

  const bestCategorySlugs = await rankedCategorySlugs()
  const bestCategoryPages: MetadataRoute.Sitemap = bestCategorySlugs.map((slug) => ({
    url: `${BASE}/best/${slug}`,
    lastModified: now,
    changeFrequency: 'weekly' as const,
    priority: 0.8,
  }))

  const productPages = await productEntries(now)
  const brandPages = await brandEntries(now)
  const matchupPages = await matchupEntries(now)
  const brandMatchupPages = await brandMatchupEntries(now)
  const alternativePages = await alternativeEntries(now)

  return [...staticPages, ...guidePages, ...ingredientPages, ...ingredientMatchupPages, ...stackPages, ...bestCategoryPages, ...brandPages, ...matchupPages, ...brandMatchupPages, ...alternativePages, ...productPages]
}
