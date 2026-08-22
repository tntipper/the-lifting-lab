import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, hasVerifiedCost, withScore, sortScored, type Product, type SortKey } from '@/lib/products'
import { CATEGORIES } from '@/lib/categories'
import { buyLink } from '@/lib/affiliate'

// ARD agent-facing endpoint. Public, read-only, CORS-open.
// GET /api/ard/compare?category=creatine&sort=value&limit=5
// Returns a ranked list of supplements scored on dosing/value, with buy links.
// Backed by the same scoring + sorting the site uses, so agents and humans agree.

const SITE_URL = 'https://www.theliftinglab.co.uk'
const VALID_SLUGS = new Set(CATEGORIES.map((c) => c.slug))
const ARD_SORTS: SortKey[] = ['value', 'budget', 'score']

function cors<T extends Response>(res: T): T {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300')
  return res
}

export async function OPTIONS() {
  return cors(new NextResponse(null, { status: 204 }))
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const category = (searchParams.get('category') || '').trim().toLowerCase()
  const sortParam = searchParams.get('sort') as SortKey | null
  const sort: SortKey = sortParam && ARD_SORTS.includes(sortParam) ? sortParam : 'value'
  const limitRaw = parseInt(searchParams.get('limit') || '5', 10)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 20) : 5

  if (!category || !VALID_SLUGS.has(category)) {
    return cors(
      NextResponse.json(
        { error: 'Unknown or missing `category`.', valid_categories: [...VALID_SLUGS] },
        { status: 400 },
      ),
    )
  }

  const sb = createPublicClient()
  const { data, error } = await sb
    .from('products')
    .select(PRODUCT_COLUMNS)
    .eq('status', 'active')
    .eq('category', category)
  if (error) return cors(NextResponse.json({ error: error.message }, { status: 500 }))

  const scored = (data as Product[] | null || []).map(withScore)
  // Cost-based sorts only rank products with a verified cost-per-serving;
  // unpriced products are excluded rather than listed as £0 or as trailing
  // "ranked" entries (TLL-P0-3). Score sort keeps them, flagged via cost_verified.
  const eligible = sort === 'value' || sort === 'budget' ? scored.filter(hasVerifiedCost) : scored
  const ranked = sortScored(eligible, sort).slice(0, limit)

  const results = ranked.map((p, i) => ({
    rank: i + 1,
    id: p.id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    score: p.score, // Lifting Lab clinical score 0-100 (higher is better; null = not yet scored)
    retail_price_gbp: p.retail_price,
    cost_per_serving_gbp: p.cost_per_serving,
    cost_verified: hasVerifiedCost(p), // false = no verified price/servings; never ranked on cost
    servings_per_container: p.servings_per_container,
    informed_sport: p.informed_sport ?? false,
    product_url: `${SITE_URL}/products/${p.id}`,
    buy_url: buyLink(p.brand, p.name, p.buy_url),
  }))

  return cors(
    NextResponse.json({
      category,
      sort,
      count: results.length,
      methodology: `${SITE_URL}/guide`,
      disclosure:
        'Rankings are independent and based on ingredient dosing, serving size and price-per-serving value. Buy links may earn The Lifting Lab an affiliate commission.',
      results,
    }),
  )
}
