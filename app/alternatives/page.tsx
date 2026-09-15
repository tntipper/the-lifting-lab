import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { categoryLabel, CATEGORIES } from '@/lib/categories'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { productSlug } from '@/lib/matchups'
import { curatedAlternativeTargets, type AltProduct } from '@/lib/alternatives'

export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

export const metadata: Metadata = {
  "title": "Same-category supplement research",
  "description": "Browse related research records and compare labels and listed prices. No approved replacement or effectiveness recommendation is available.",
  "alternates": {
    "canonical": "https://www.theliftinglab.co.uk/alternatives"
  },
  "openGraph": {
    "title": "Same-category supplement research",
    "description": "Browse related research records and compare labels and listed prices. No approved replacement or effectiveness recommendation is available.",
    "url": "https://www.theliftinglab.co.uk/alternatives",
    "type": "website"
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "Same-category supplement research",
    "description": "Browse related research records and compare labels and listed prices. No approved replacement or effectiveness recommendation is available."
  }
}

async function getTargets(): Promise<AltProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb.from('products').select(PRODUCT_COLUMNS).eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map((p) => {
      const s = withScore(p)
      return {
        id: p.id,
        brand: p.brand,
        name: p.name,
        category: p.category,
        score: s.score,
        cost_per_serving: s.cost_per_serving,
      }
    })
    return curatedAlternativeTargets(scored)
  } catch {
    return []
  }
}

const CATEGORY_ORDER = CATEGORIES.map((c) => c.slug)

export default async function AlternativesHubPage() {
  const targets = await getTargets()

  const byCat = new Map<string, AltProduct[]>()
  for (const t of targets) {
    const arr = byCat.get(t.category) || []
    arr.push(t)
    byCat.set(t.category, arr)
  }
  const groups = Array.from(byCat.entries()).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
  )

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Alternatives', item: `${SITE}/alternatives` },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }
  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Supplement Alternatives UK ${YEAR}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: targets.length,
      itemListElement: targets.map((t, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: `${t.brand} ${t.name} alternatives`,
        url: `${SITE}/alternatives/${productSlug(t.brand, t.name)}`,
      })),
    },
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(itemListJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Alternatives</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Same-category research · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Alternatives</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
        <p className="text-lab-muted text-sm mb-10">
          Prefer a straight two-product face-off?{' '}
          <Link href="/vs" className="text-lab-lime hover:underline underline-offset-2">
            Browse head-to-head comparisons →
          </Link>
        </p>

        {groups.length === 0 ? (
          <p className="text-lab-muted text-sm">Alternatives are being generated — check back shortly.</p>
        ) : (
          <div className="space-y-10">
            {groups.map(([category, list]) => (
              <section key={category}>
                <h2 className="text-xl font-black uppercase tracking-wide mb-4">
                  {categoryLabel(category)} <span className="text-lab-lime">alternatives</span>
                </h2>
                <div className="space-y-2.5">
                  {list.map((t) => (
                    <Link
                      key={t.id}
                      href={`/alternatives/${productSlug(t.brand, t.name)}`}
                      className="block bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime/50 transition-colors"
                    >
                      <p className="text-sm font-bold leading-snug text-white">
                        Alternatives to {t.brand} {t.name}
                      </p>
                      {t.score != null && (
                        <p className="text-[11px] text-lab-muted mt-1">
                          Historical value {t.score}/100 is unverified — compare labels and listed prices
                        </p>
                      )}
                    </Link>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
