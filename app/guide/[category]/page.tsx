import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { getGuide, GUIDE_SLUGS } from '@/lib/guides'
import { categoryLabel } from '@/lib/categories'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type ScoredProduct } from '@/lib/products'

export const revalidate = 86400 // refresh top products daily

export function generateStaticParams() {
  return GUIDE_SLUGS.map((category) => ({ category }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  const guide = getGuide(category)
  if (!guide) return { title: 'Guide not found — The Lifting Lab' }
  const url = `https://theliftinglab.co.uk/guide/${guide.slug}`
  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: guide.metaTitle,
      description: guide.metaDescription,
      url,
      type: 'article',
      siteName: 'The Lifting Lab',
    },
    twitter: {
      card: 'summary_large_image',
      title: guide.metaTitle,
      description: guide.metaDescription,
    },
  }
}

async function topProducts(category: string, limit = 3): Promise<ScoredProduct[]> {
  try {
    const sb = createPublicClient()
    const { data, error } = await sb
      .from('products')
      .select(PRODUCT_COLUMNS)
      .eq('status', 'active')
      .eq('category', category)
    if (error || !data) return []
    return sortScored((data as Product[]).map(withScore), 'score').slice(0, limit)
  } catch {
    return []
  }
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ category: string }>
}) {
  const { category } = await params
  const guide = getGuide(category)
  if (!guide) notFound()

  const products = await topProducts(guide.slug)

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />

      <article className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Supplement Guide · {categoryLabel(guide.slug)}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          {guide.h1}
        </h1>

        <p className="text-lg text-white/90 leading-relaxed mb-6">{guide.intro}</p>

        {guide.paras.map((p, i) => (
          <p key={i} className="text-lab-muted leading-relaxed mb-5">
            {p}
          </p>
        ))}

        {/* top products */}
        {products.length > 0 && (
          <section className="mt-12">
            <h2 className="text-xl font-black uppercase tracking-wide mb-1">
              Top {categoryLabel(guide.slug)} <span className="text-lab-lime">picks</span>
            </h2>
            <p className="text-lab-muted text-sm mb-5">
              Ranked by The Lifting Lab clinical score.
            </p>
            <div className="space-y-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center gap-4 bg-lab-panel border border-lab-border rounded-xl p-4"
                >
                  <ScoreBadge score={p.score} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-sm font-bold truncate">{p.brand}</p>
                    <p className="text-lab-muted text-xs truncate">{p.name}</p>
                  </div>
                  <Link
                    href={`/products?category=${guide.slug}`}
                    className="text-[10px] uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-3 py-1.5 rounded-lg shrink-0"
                  >
                    View
                  </Link>
                </div>
              ))}
            </div>
            <div className="mt-5">
              <Link
                href={`/products?category=${guide.slug}`}
                className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90 inline-block"
              >
                See all {categoryLabel(guide.slug)} →
              </Link>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-14">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">
            Frequently asked
          </h2>
          <div className="space-y-4">
            {guide.faqs.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-white text-sm font-bold mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="mt-12 pt-8 border-t border-lab-border">
          <Link
            href="/guide"
            className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
          >
            ← All guides
          </Link>
        </div>
      </article>
    </div>
  )
}
