import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { buildBrandStats, curatedBrandMatchups, type BrandMatchup } from '@/lib/brand-matchups'

export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

export const metadata: Metadata = {
  title: `Supplement Brand Comparisons — Head-to-Head UK ${YEAR} | The Lifting Lab`,
  description:
    'Brand vs brand supplement showdowns scored against evidence-based dosing. Compare Bulk, Myprotein, Optimum Nutrition and more on average Effectiveness Match, range and true cost per serving.',
  alternates: { canonical: `${SITE}/brands-vs` },
  openGraph: {
    title: `Supplement Brand Comparisons — Head-to-Head UK ${YEAR}`,
    description: 'Brand vs brand supplement showdowns scored against evidence-based dosing.',
    url: `${SITE}/brands-vs`,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Supplement Brand Comparisons — Head-to-Head UK ${YEAR}`,
    description: 'Brand vs brand supplement showdowns scored against evidence-based dosing.',
  },
}

// One DB query, derive the curated brand-matchup set.
async function getMatchups(): Promise<BrandMatchup[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map(withScore)
    return curatedBrandMatchups(buildBrandStats(scored))
  } catch {
    return []
  }
}

export default async function BrandsVsHubPage() {
  const matchups = await getMatchups()

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Brand Comparisons', item: `${SITE}/brands-vs` },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Brand Comparisons</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Brand Showdowns · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Brand <span className="text-lab-lime">Showdowns</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Which supplement brand actually doses better? We pit the biggest UK brands against each
          other on average Effectiveness Match, catalogue range and true cost per serving — judged on
          what is in the tub, never marketing or reputation.
        </p>
        <p className="text-lab-muted text-sm mb-10">
          Comparing a single product instead?{' '}
          <Link href="/vs" className="text-lab-lime hover:underline underline-offset-2">
            See product head-to-heads →
          </Link>
        </p>

        {matchups.length === 0 ? (
          <p className="text-lab-muted text-sm">Brand showdowns are being generated — check back shortly.</p>
        ) : (
          <div className="space-y-2.5">
            {matchups.map((m) => (
              <Link
                key={m.slug}
                href={`/brands-vs/${m.slug}`}
                className="block bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime/50 transition-colors"
              >
                <p className="text-sm font-bold leading-snug">
                  <span className="text-white">{m.a.brand}</span>
                  <span className="text-lab-lime mx-1.5">vs</span>
                  <span className="text-white">{m.b.brand}</span>
                </p>
                {m.a.avgScore != null && m.b.avgScore != null && (
                  <p className="text-[11px] text-lab-muted mt-1">
                    Avg Effectiveness Match {m.a.avgScore} vs {m.b.avgScore} · {m.a.count} vs {m.b.count} products
                  </p>
                )}
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
