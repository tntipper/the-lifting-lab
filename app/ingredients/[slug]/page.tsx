import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { getIngredient, INGREDIENT_SLUGS, type EvidenceLevel } from '@/lib/ingredients'
import { GUIDE_SLUGS } from '@/lib/guides'
import { categoryLabel } from '@/lib/categories'
import { createPublicClient } from '@/lib/supabase-public'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product, type ScoredProduct } from '@/lib/products'

export const revalidate = 86400 // refresh the top-products strip daily

export function generateStaticParams() {
  return INGREDIENT_SLUGS.map((slug) => ({ slug }))
}

const EVIDENCE_STYLE: Record<EvidenceLevel, string> = {
  Strong: 'text-lab-lime border-lab-lime/50',
  Moderate: 'text-amber-400 border-amber-400/40',
  Limited: 'text-lab-muted border-lab-border',
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const ing = getIngredient(slug)
  if (!ing) return { title: 'Ingredient not found — The Lifting Lab' }
  const url = `https://theliftinglab.co.uk/ingredients/${ing.slug}`
  return {
    title: ing.metaTitle,
    description: ing.metaDescription,
    alternates: { canonical: url },
    openGraph: {
      title: ing.metaTitle,
      description: ing.metaDescription,
      url,
      type: 'article',
      siteName: 'The Lifting Lab',
    },
    twitter: {
      card: 'summary_large_image',
      title: ing.metaTitle,
      description: ing.metaDescription,
    },
  }
}

async function topProducts(category: string | undefined, limit = 3): Promise<ScoredProduct[]> {
  if (!category) return []
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

export default async function IngredientPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const ing = getIngredient(slug)
  if (!ing) notFound()

  const products = await topProducts(ing.productCategory)
  const url = `https://theliftinglab.co.uk/ingredients/${ing.slug}`

  // Only link guides that genuinely exist, so we never produce a dead link.
  const relatedGuides = ing.relatedGuides.filter((g) => GUIDE_SLUGS.includes(g))

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: ing.faqs.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  // DefinedTerm names the ingredient as a glossary entity; MedicalWebPage frames
  // the YMYL health content with a publisher + review date for E-E-A-T.
  const definedTermJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: ing.name,
    headline: ing.metaTitle,
    description: ing.metaDescription,
    url,
    inLanguage: 'en-GB',
    lastReviewed: '2026-06-24',
    publisher: {
      '@type': 'Organization',
      name: 'The Lifting Lab',
      url: 'https://theliftinglab.co.uk',
    },
    mainEntity: {
      '@type': 'DefinedTerm',
      name: ing.name,
      ...(ing.aka && ing.aka.length > 0 && { alternateName: ing.aka }),
      description: ing.whatItIs,
      inDefinedTermSet: {
        '@type': 'DefinedTermSet',
        name: 'The Lifting Lab Supplement Ingredient Library',
        url: 'https://theliftinglab.co.uk/ingredients',
      },
    },
  }

  const itemListJsonLd = products.length > 0 ? {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Top ${categoryLabel(ing.productCategory as string)} picks`,
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
        url: `https://theliftinglab.co.uk/products/${p.id}`,
      },
    })),
  } : null

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: 'https://theliftinglab.co.uk' },
      { name: 'Ingredients', item: 'https://theliftinglab.co.uk/ingredients' },
      { name: ing.name, item: url },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const sections: { heading: string; body: string }[] = [
    { heading: 'What it is', body: ing.whatItIs },
    { heading: 'How it works', body: ing.howItWorks },
    { heading: 'Effective dose', body: ing.dose },
    { heading: 'Safety and upper limit', body: ing.safety },
  ]

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      {itemListJsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }} />
      )}

      <article className="max-w-3xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">Home</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li>
              <Link href="/ingredients" className="hover:text-white">Ingredients</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">{ing.name}</li>
          </ol>
        </nav>

        <div className="flex items-center gap-3 mb-4">
          <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime">
            Ingredient
          </p>
          <span
            className={`text-[9px] uppercase tracking-widest font-bold border rounded-full px-2 py-1 ${EVIDENCE_STYLE[ing.evidence]}`}
          >
            {ing.evidence} evidence
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-3">
          {ing.name}
        </h1>
        {ing.aka && ing.aka.length > 0 && (
          <p className="text-lab-muted text-sm mb-5">
            Also known as: {ing.aka.join(', ')}
          </p>
        )}
        <p className="text-lg text-white/90 leading-relaxed mb-8">{ing.oneLiner}</p>

        {sections.map((s) => (
          <section key={s.heading} className="mb-7">
            <h2 className="text-xl font-black uppercase tracking-wide mb-3">{s.heading}</h2>
            <p className="text-lab-muted leading-relaxed">{s.body}</p>
          </section>
        ))}

        <section className="mb-7">
          <h2 className="text-xl font-black uppercase tracking-wide mb-3">Where you find it</h2>
          <p className="text-lab-muted leading-relaxed">{ing.foundIn}</p>
        </section>

        {/* top products that lead the category this ingredient belongs to */}
        {products.length > 0 && ing.productCategory && (
          <section className="mt-12">
            <h2 className="text-xl font-black uppercase tracking-wide mb-1">
              Top {categoryLabel(ing.productCategory)} <span className="text-lab-lime">picks</span>
            </h2>
            <p className="text-lab-muted text-sm mb-5">
              The highest-scoring products in the category where {ing.name} matters most.
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
                href={`/products?category=${ing.productCategory}`}
                className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90 inline-block"
              >
                See all {categoryLabel(ing.productCategory)} →
              </Link>
            </div>
          </section>
        )}

        {/* FAQ */}
        <section className="mt-14">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">Frequently asked</h2>
          <div className="space-y-4">
            {ing.faqs.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-white text-sm font-bold mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* related guides — connect the ingredient axis to the category guides */}
        {relatedGuides.length > 0 && (
          <section className="mt-14">
            <h2 className="text-xl font-black uppercase tracking-wide mb-5">Related guides</h2>
            <div className="flex flex-wrap gap-2">
              {relatedGuides.map((g) => (
                <Link
                  key={g}
                  href={`/guide/${g}`}
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 px-4 py-2 rounded-lg transition-colors"
                >
                  {categoryLabel(g)}
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className="text-lab-muted/70 text-xs mt-12 leading-relaxed">
          This page is educational and not medical advice. Doses are general guidance from the
          published research, not a personal prescription. Before starting any supplement that
          could affect a medical condition or interact with medication, speak to a qualified
          clinician.
        </p>

        <div className="mt-8 pt-8 border-t border-lab-border">
          <Link
            href="/ingredients"
            className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
          >
            ← All ingredients
          </Link>
        </div>
      </article>
    </div>
  )
}
