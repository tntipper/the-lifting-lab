import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase-public'
import { scoreFor } from '@/lib/scores'
import { categoryLabel } from '@/lib/categories'
import { getGuide } from '@/lib/guides'
import ProductDetailPage from './ProductDetailPage'

const SITE = 'https://www.theliftinglab.co.uk'

type Props = { params: Promise<{ id: string }> }

type ProductMeta = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
  retail_price: number | null
  buy_url: string | null
}

async function fetchProductMeta(id: string): Promise<ProductMeta | null> {
  try {
    const sb = createPublicClient()
    const { data } = await sb
      .from('products')
      .select('id, name, brand, category, image_url, retail_price, buy_url')
      .eq('id', id)
      .eq('status', 'active')
      .maybeSingle()
    return (data as ProductMeta | null) ?? null
  } catch {
    return null
  }
}

// Aggregate the publicly-visible user reviews for one product. RLS on `reviews`
// restricts the anon client to approved (or auto-approved) rows, so this matches
// exactly what a logged-out visitor sees in the on-page review section — which is
// the requirement for a valid AggregateRating rich result.
async function fetchReviewAggregate(id: string): Promise<{ average: number; count: number } | null> {
  try {
    const sb = createPublicClient()
    const { data } = await sb.from('reviews').select('rating').eq('product_id', id)
    const rows = (data as { rating: number }[] | null) ?? []
    if (rows.length === 0) return null
    const sum = rows.reduce((a, r) => a + r.rating, 0)
    return { average: Math.round((sum / rows.length) * 10) / 10, count: rows.length }
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const product = await fetchProductMeta(id)
  if (!product) return { title: 'Product Not Found | The Lifting Lab' }

  const score = scoreFor(product.brand, product.name)
  const cat = categoryLabel(product.category)
  const title = `${product.brand} ${product.name} Score & Review | The Lifting Lab`
  const description = score != null
    ? `${product.brand} ${product.name} scores ${score}/100 on our Effectiveness Match ${cat.toLowerCase()} rating. Dose-for-dose analysis vs EFSA reference values.`
    : `${product.brand} ${product.name} — evidence-based ${cat.toLowerCase()} analysis from The Lifting Lab.`

  return {
    title,
    description,
    alternates: { canonical: `${SITE}/products/${id}` },
    openGraph: { title, description, type: 'article', url: `${SITE}/products/${id}` },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  const product = await fetchProductMeta(id)

  // Structured data — server-rendered so crawlers see it in the initial HTML.
  // Skipped entirely if the product can't be resolved (client page handles the
  // not-found state); never blocks rendering.
  let jsonLd: object[] = []
  if (product) {
    const score = scoreFor(product.brand, product.name)
    const reviews = await fetchReviewAggregate(id)
    const url = `${SITE}/products/${id}`
    const fullName = `${product.brand} ${product.name}`
    const guide = getGuide(product.category)

    const productLd: Record<string, unknown> = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: fullName,
      brand: { '@type': 'Brand', name: product.brand },
      category: categoryLabel(product.category),
      url,
      ...(product.image_url ? { image: product.image_url } : {}),
      // The Lifting Lab's editorial Effectiveness Match score, expressed on its
      // native 0-100 scale. We are an independent reviewer of these products
      // (not the seller), so this is a legitimate editorial Review.
      ...(score != null && {
        review: {
          '@type': 'Review',
          name: `${fullName} Effectiveness Match analysis`,
          reviewRating: {
            '@type': 'Rating',
            ratingValue: score,
            bestRating: 100,
            worstRating: 0,
          },
          author: { '@type': 'Organization', name: 'The Lifting Lab', url: SITE },
        },
      }),
      // Real user reviews, only when at least one is publicly visible.
      ...(reviews && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: reviews.average,
          reviewCount: reviews.count,
          bestRating: 5,
          worstRating: 1,
        },
      }),
      // Only advertise an offer when we have both a price and a real buy link.
      ...(product.retail_price != null && product.buy_url && {
        offers: {
          '@type': 'Offer',
          price: product.retail_price,
          priceCurrency: 'GBP',
          availability: 'https://schema.org/InStock',
          url: product.buy_url,
        },
      }),
    }

    const crumbs: { name: string; item: string }[] = [
      { name: 'Home', item: SITE },
      { name: 'Supplements', item: `${SITE}/products` },
      ...(guide ? [{ name: categoryLabel(product.category), item: `${SITE}/guide/${product.category}` }] : []),
      { name: fullName, item: url },
    ]
    const breadcrumbLd = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.name,
        item: c.item,
      })),
    }

    jsonLd = [productLd, breadcrumbLd]
  }

  return (
    <>
      {jsonLd.map((ld, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }}
        />
      ))}
      <ProductDetailPage id={id} />
    </>
  )
}
