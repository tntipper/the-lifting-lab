import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { categoryLabel, CATEGORIES } from '@/lib/categories'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product } from '@/lib/products'
import { curatedMatchups, type Matchup, type MatchupProduct } from '@/lib/matchups'

export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const YEAR = 2026

export const metadata: Metadata = {
  title: `Supplement Comparisons — Head-to-Head UK ${YEAR} | The Lifting Lab`,
  description:
    'Side-by-side supplement comparisons scored against evidence-based dosing. See which whey, creatine, pre-workout, EAA and more wins on Effectiveness Match and true cost per serving.',
  alternates: { canonical: `${SITE}/vs` },
  openGraph: {
    title: `Supplement Comparisons — Head-to-Head UK ${YEAR}`,
    description: 'Side-by-side supplement comparisons scored against evidence-based dosing.',
    url: `${SITE}/vs`,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
}

// One DB query, derive the curated matchup set, group by category.
async function getMatchups(): Promise<Matchup<MatchupProduct>[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return []
    const scored = (data as Product[]).map((p) => {
      const s = withScore(p)
      return { id: p.id, name: p.name, brand: p.brand, category: p.category, score: s.score }
    })
    return curatedMatchups(scored)
  } catch {
    return []
  }
}

const CATEGORY_ORDER = CATEGORIES.map((c) => c.slug)

export default async function VsHubPage() {
  const matchups = await getMatchups()

  // group by category, in the canonical browse order
  const byCat = new Map<string, Matchup<MatchupProduct>[]>()
  for (const m of matchups) {
    const arr = byCat.get(m.category) || []
    arr.push(m)
    byCat.set(m.category, arr)
  }
  const groups = Array.from(byCat.entries()).sort(
    (a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0]),
  )

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Compare', item: `${SITE}/vs` },
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
            <li aria-current="page" className="text-white/80">Compare</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Head-to-Head · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Comparisons</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The most-asked head-to-head matchups, scored against the same evidence-based clinical reference. Each
          comparison shows active doses, true cost per serving and Effectiveness Match scores side by side.
        </p>
        <p className="text-lab-muted text-sm mb-10">
          Want a custom matchup of any three products?{' '}
          <Link href="/compare" className="text-lab-lime hover:underline underline-offset-2">
            Build your own comparison →
          </Link>
        </p>

        {groups.length === 0 ? (
          <p className="text-lab-muted text-sm">Comparisons are being generated — check back shortly.</p>
        ) : (
          <div className="space-y-10">
            {groups.map(([category, list]) => (
              <section key={category}>
                <h2 className="text-xl font-black uppercase tracking-wide mb-4">
                  {categoryLabel(category)} <span className="text-lab-lime">match-ups</span>
                </h2>
                <div className="space-y-2.5">
                  {list.map((m) => (
                    <Link
                      key={m.slug}
                      href={`/vs/${m.slug}`}
                      className="block bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime/50 transition-colors"
                    >
                      <p className="text-sm font-bold leading-snug">
                        <span className="text-white">{m.a.brand} {m.a.name}</span>
                        <span className="text-lab-lime mx-1.5">vs</span>
                        <span className="text-white">{m.b.brand} {m.b.name}</span>
                      </p>
                      {m.a.score != null && m.b.score != null && (
                        <p className="text-[11px] text-lab-muted mt-1">
                          Effectiveness Match {m.a.score} vs {m.b.score}
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
