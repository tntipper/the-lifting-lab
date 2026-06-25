import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { getGuide, GUIDE_SLUGS } from '@/lib/guides'
import { getCitations, formatCitation } from '@/lib/guide-citations'
import { categoryLabel } from '@/lib/categories'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
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
  const url = `https://www.theliftinglab.co.uk/guide/${guide.slug}`
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
  const citations = getCitations(guide.slug)
  const url = `https://www.theliftinglab.co.uk/guide/${guide.slug}`

  // Sibling guides from the same browse group — gives each guide topical
  // internal links instead of being an SEO island linking only back to /guide.
  const group = CATEGORY_GROUPS.find((g) => g.categories.includes(guide.slug))
  const relatedSlugs = group
    ? group.categories.filter((c) => c !== guide.slug && GUIDE_SLUGS.includes(c)).slice(0, 4)
    : []

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: guide.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  // MedicalWebPage with verified scientific citations — strengthens E-E-A-T
  // for this YMYL (health) content in search.
  const articleJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: guide.h1,
    headline: guide.metaTitle,
    description: guide.metaDescription,
    url,
    inLanguage: 'en-GB',
    lastReviewed: '2026-06-15',
    publisher: {
      '@type': 'Organization',
      name: 'The Lifting Lab',
      url: 'https://www.theliftinglab.co.uk',
    },
    ...(citations.length > 0 && {
      citation: citations.map((c) => ({
        '@type': 'ScholarlyArticle',
        name: c.title,
        author: c.authors,
        ...(c.year && { datePublished: c.year }),
        publisher: c.source,
        url: c.url,
      })),
    }),
  }

  // ItemList — the canonical structured-data signal for a ranked "best X" list,
  // which is exactly the query class these guides target ("best creatine UK 2026").
  // Backed 1:1 by the visible "Top picks" list below; each entry resolves to the
  // schema-rich product detail page so Google can build a ranked product carousel.
  // Guarded on products so a DB hiccup never emits an empty/invalid ItemList.
  const itemListJsonLd = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top ${categoryLabel(guide.slug)} picks`,
    description: `${categoryLabel(guide.slug)} supplements ranked by The Lifting Lab Effectiveness Match score.`,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    numberOfItems: products.length,
    itemListElement: products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      item: {
        '@type': 'Product',
        name: p.name,
        brand: { '@type': 'Brand', name: p.brand },
        category: categoryLabel(p.category),
        url: `https://www.theliftinglab.co.uk/products/${p.id}`,
      },
    })),
  } : null

  // BreadcrumbList — surfaces a Home › Guides › Category trail in search results,
  // backed by the visible breadcrumb nav below.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: 'https://www.theliftinglab.co.uk' },
      { name: 'Guides', item: 'https://www.theliftinglab.co.uk/guide' },
      { name: `${categoryLabel(guide.slug)} Guide`, item: url },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
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
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">Home</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li>
              <Link href="/guide" className="hover:text-white">Guides</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">
              {categoryLabel(guide.slug)}
            </li>
          </ol>
        </nav>
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
              Ranked by The Lifting Lab Effectiveness Match score.
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
                    href={`/products/${p.id}`}
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

        {/* References — verified scientific sources (E-E-A-T) */}
        {citations.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-black uppercase tracking-wide mb-1">
              References
            </h2>
            <p className="text-lab-muted text-sm mb-5">
              Sources behind this guide. Each was checked against the original
              publication.
            </p>
            <ol className="space-y-3 list-none">
              {citations.map((c, i) => (
                <li
                  key={c.url}
                  className="flex gap-3 text-sm text-lab-muted leading-relaxed"
                >
                  <span className="text-lab-lime font-bold shrink-0">{i + 1}.</span>
                  <span>
                    {formatCitation(c)}{' '}
                    <a
                      href={c.url}
                      target="_blank"
                      rel="nofollow noopener noreferrer"
                      className="text-white/80 hover:text-lab-lime underline underline-offset-2 break-words"
                    >
                      View source
                    </a>
                  </span>
                </li>
              ))}
            </ol>
            <p className="text-lab-muted/70 text-xs mt-6 leading-relaxed">
              This guide is educational and not medical advice. For personal
              health concerns, or before starting any supplement that could
              affect a medical condition or medication, speak to a qualified
              clinician.
            </p>
          </section>
        )}

        {/* related guides — topical internal links to sibling categories */}
        {relatedSlugs.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-black uppercase tracking-wide mb-5">
              Related guides
            </h2>
            <div className="flex flex-wrap gap-2">
              {relatedSlugs.map((slug) => (
                <Link
                  key={slug}
                  href={`/guide/${slug}`}
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 px-4 py-2 rounded-lg transition-colors"
                >
                  {categoryLabel(slug)}
                </Link>
              ))}
            </div>
          </section>
        )}

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
