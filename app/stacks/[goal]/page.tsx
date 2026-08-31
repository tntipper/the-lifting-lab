import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, type Product, type ScoredProduct } from '@/lib/products'
import { getStackGuide, selectStack, STACK_GUIDES, STACK_SLUGS } from '@/lib/stacks'

// SSG with a daily refresh so newly added/rescored products can change the
// recommended picks without a redeploy. Mirrors /best and /guide.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'

export function generateStaticParams() {
  return STACK_SLUGS.map((goal) => ({ goal }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ goal: string }>
}): Promise<Metadata> {
  const { goal } = await params
  const stack = getStackGuide(goal)
  if (!stack) return { title: 'Stack not found — The Lifting Lab' }
  const url = `${SITE}/stacks/${stack.slug}`
  return {
    title: stack.metaTitle,
    description: stack.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: stack.metaTitle,
      description: stack.metaDescription,
      url,
      type: 'article',
      siteName: 'The Lifting Lab',
    },
    twitter: {
      card: 'summary_large_image',
      title: stack.metaTitle,
      description: stack.metaDescription,
    },
  }
}

// Single server-side query, grouped by category. DB-failure safe: an empty map
// just renders the graceful empty state, never a 500.
async function productsByCategory(): Promise<Map<string, ScoredProduct[]>> {
  const map = new Map<string, ScoredProduct[]>()
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
    if (error || !data) return map
    for (const p of (data as Product[]).map(withScore)) {
      const arr = map.get(p.category)
      if (arr) arr.push(p)
      else map.set(p.category, [p])
    }
    return map
  } catch {
    return map
  }
}

function fmt(n: number) {
  return n < 10 ? `£${n.toFixed(2)}` : `£${Math.round(n)}`
}

export default async function StackPage({
  params,
}: {
  params: Promise<{ goal: string }>
}) {
  const { goal } = await params
  const stack = getStackGuide(goal)
  if (!stack) notFound()

  const byCategory = await productsByCategory()
  const picks = selectStack(byCategory, stack)
  const url = `${SITE}/stacks/${stack.slug}`

  // Upfront one-off cost (sum of retail prices we actually have) and a monthly
  // cost-per-serving total — both guarded so partial price data never lies.
  const upfront = picks.reduce((s, p) => s + (p.retail_price ?? 0), 0)
  const pricedCount = picks.filter((p) => p.retail_price != null).length
  const perServingTotal = picks.reduce((s, p) => s + (p.cost_per_serving ?? 0), 0)
  const perServingCount = picks.filter((p) => p.cost_per_serving != null).length

  // Other stacks to cross-link — keeps each stack page out of being an SEO island.
  const related = STACK_GUIDES.filter((s) => s.slug !== stack.slug).slice(0, 5)

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: stack.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  // ItemList — the recommended stack as an ordered product list, backed 1:1 by
  // the visible stack below; each entry resolves to a schema-rich product page.
  // Guarded so a DB hiccup never emits an empty/invalid list.
  const itemListJsonLd = picks.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: stack.h1,
    description: stack.metaDescription,
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: picks.length,
    itemListElement: picks.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        brand: { '@type': 'Brand', name: p.brand },
        category: categoryLabel(p.category),
        url: `${SITE}/products/${p.id}`,
      },
    })),
  } : null

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Stacks', item: `${SITE}/stacks` },
      { name: stack.h1, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}

      <article className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li><Link href="/stacks" className="hover:text-white">Stacks</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{stack.eyebrow.replace(/^Goal · /, '')}</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          {stack.eyebrow}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {stack.h1} <span className="text-lab-lime">UK 2026</span>
        </h1>

        <p className="text-lg text-white/90 leading-relaxed mb-6">{stack.intro}</p>

        {/* The recommended stack */}
        {picks.length === 0 ? (
          <div className="text-center py-16 text-lab-muted bg-lab-panel border border-lab-border rounded-2xl">
            <p className="text-4xl mb-3">🧪</p>
            <p className="text-sm">This stack is being assembled. Check back shortly.</p>
          </div>
        ) : (
          <section className="mb-12">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-xl font-black uppercase tracking-wide">
                The <span className="text-lab-lime">Stack</span>
              </h2>
              <span className="text-[11px] uppercase tracking-widest text-lab-muted">
                {picks.length} product{picks.length === 1 ? '' : 's'}
              </span>
            </div>
            <p className="text-lab-muted text-sm mb-5">
              {stack.pick === 'budget'
                ? 'Each pick is the best value by cost per serving in its category.'
                : 'Each pick is the current top scorer in its category by Effectiveness Match.'}
            </p>

            <div className="space-y-3">
              {picks.map((p, i) => {
                const hasGuide = GUIDE_SLUGS.includes(p.category)
                const href = buyLink(p.brand, p.name, p.buy_url)
                return (
                  <div
                    key={p.id}
                    className="bg-lab-panel border border-lab-border rounded-xl p-4"
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-black text-lab-muted w-5 text-center shrink-0">
                        {i + 1}
                      </span>
                      <ScoreBadge score={p.score} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] uppercase tracking-widest text-lab-lime mb-0.5">
                          {categoryLabel(p.category)}
                        </p>
                        <Link
                          href={`/products/${p.id}`}
                          className="hover:text-lab-lime transition-colors"
                        >
                          <p className="text-white text-sm font-black leading-tight truncate">
                            {p.brand}
                          </p>
                        </Link>
                        <p className="text-lab-muted text-xs truncate">{p.name}</p>
                        {p.cost_per_serving != null && (
                          <p className="text-[11px] text-white/60 mt-1">
                            {fmt(p.cost_per_serving)} per serving
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={`grid ${href ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3`}>
                      <Link
                        href={`/products/${p.id}`}
                        className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                      >
                        Details
                      </Link>
                      {hasGuide ? (
                        <Link
                          href={`/guide/${p.category}`}
                          className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                        >
                          Guide
                        </Link>
                      ) : (
                        <Link
                          href={`/products?category=${p.category}`}
                          className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
                        >
                          See all
                        </Link>
                      )}
                      {href && (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
                          style={{
                            background: 'rgba(166,226,46,0.12)',
                            color: '#a6e22e',
                            border: '1px solid rgba(166,226,46,0.5)',
                          }}
                        >
                          Buy
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* cost summary — only the totals we genuinely have data for */}
            {(pricedCount > 0 || perServingCount > 0) && (
              <div className="mt-4 bg-lab-panel border border-lab-border rounded-xl p-4 text-sm">
                {pricedCount > 0 && (
                  <p className="text-white/90">
                    <span className="font-black text-lab-lime">{fmt(upfront)}</span> upfront for the stack
                    {pricedCount < picks.length && (
                      <span className="text-lab-muted"> ({pricedCount} of {picks.length} priced)</span>
                    )}
                  </p>
                )}
                {perServingCount > 0 && (
                  <p className="text-lab-muted mt-1">
                    ≈ {fmt(perServingTotal)} per day across {perServingCount} product{perServingCount === 1 ? '' : 's'} with cost data
                  </p>
                )}
              </div>
            )}

            {/* funnel to the interactive personaliser */}
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href="/wizard"
                className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
              >
                Personalise my stack →
              </Link>
              <Link
                href="/products"
                className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
              >
                Browse all products
              </Link>
            </div>
          </section>
        )}

        {/* educational body */}
        <section className="mb-4">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">
            Why this stack
          </h2>
          {stack.paras.map((p, i) => (
            <p key={i} className="text-lab-muted leading-relaxed mb-5">
              {p}
            </p>
          ))}
        </section>

        {/* FAQ */}
        <section className="mt-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">
            Frequently asked
          </h2>
          <div className="space-y-4">
            {stack.faqs.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-white text-sm font-bold mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-lab-muted/70 text-xs mt-8 leading-relaxed">
          Informational only — not medical advice. Buy links are affiliate links; we may earn a
          commission at no extra cost to you. This never affects scoring. For personal health
          concerns, or before starting a supplement that could affect a condition or medication,
          speak to a qualified clinician.
        </p>

        {/* related stacks — topical internal links */}
        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-black uppercase tracking-wide mb-5">
              Other stacks
            </h2>
            <div className="flex flex-wrap gap-2">
              {related.map((s) => (
                <Link
                  key={s.slug}
                  href={`/stacks/${s.slug}`}
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 px-4 py-2 rounded-lg transition-colors"
                >
                  {s.eyebrow.replace(/^Goal · /, '')}
                </Link>
              ))}
            </div>
          </section>
        )}

        <div className="mt-12 pt-8 border-t border-lab-border">
          <Link
            href="/stacks"
            className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
          >
            ← All stacks
          </Link>
        </div>
      </article>
    </div>
  )
}
