import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CategoryGrid from '@/components/CategoryGrid'
import FeaturedSlot from '@/components/FeaturedSlot'
import ShopHero from '@/components/ShopHero'
import TopProductsTable from '@/components/TopProductsTable'
import { fetchCatalogue } from '@/lib/product-data'

export const metadata: Metadata = {
  title: 'The Lifting Lab — Supplement research',
  description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
  alternates: { canonical: 'https://www.theliftinglab.co.uk' },
  openGraph: {
    title: 'The Lifting Lab — Supplement research',
    description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
    url: 'https://www.theliftinglab.co.uk',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Lifting Lab — Supplement research',
    description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
  },
}

const SITE = 'https://www.theliftinglab.co.uk'

const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'The Lifting Lab',
  url: SITE,
  logo: `${SITE}/opengraph-image`,
  description: 'UK supplement research records and listed-price comparisons. No approved effectiveness assessment is available.',
  sameAs: ['https://www.tiktok.com/@dadthletelab', 'https://www.instagram.com/dadthletelab'],
}

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  name: 'The Lifting Lab',
  url: SITE,
  publisher: { '@id': `${SITE}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: { '@type': 'EntryPoint', urlTemplate: `${SITE}/products?q={search_term_string}` },
    'query-input': 'required name=search_term_string',
  },
}

const researchLinks = [
  { href: '/best', label: 'Supplement research', detail: 'Browse the evidence records' },
  { href: '/value', label: 'Best value supplements', detail: 'Compare listed cost per serving' },
  { href: '/cheapest', label: 'Cheapest per serving', detail: 'Start with the price' },
  { href: '/protein-value', label: 'Protein value', detail: 'Compare cost per gram' },
  { href: '/strongest-pre-workout', label: 'Pre-workout records', detail: 'Compare label amounts' },
  { href: '/stacks', label: 'Stacks by goal', detail: 'Build a manual research stack' },
  { href: '/ingredients', label: 'Ingredients A–Z', detail: 'Understand what is on the label' },
  { href: '/calculators', label: 'Calculators', detail: 'Plan training and nutrition' },
]

export default async function Home() {
  const products = await fetchCatalogue()
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(websiteLd) }} />
      <TopNav />

      <ShopHero products={products} shopHref="/products" />

      <main className="tll-paper-section">
        <TopProductsTable products={products} />
        <div className="mx-auto max-w-7xl space-y-16 px-5 py-12 sm:px-6 sm:py-16">
          <section aria-labelledby="category-heading">
            <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="tll-eyebrow">Start with your goal</p>
                <h2 id="category-heading" className="mt-2 text-2xl font-semibold text-white">Browse by category</h2>
              </div>
              <Link href="/products" className="min-h-11 py-3 text-sm font-semibold text-lab-lime underline underline-offset-4">See all products</Link>
            </div>
            <CategoryGrid products={products} variant="compact" />
          </section>

          <FeaturedSlot />

          <section aria-labelledby="research-heading">
            <div className="mb-5">
              <p className="tll-eyebrow">Research tools</p>
              <h2 id="research-heading" className="mt-2 text-2xl font-semibold text-white">Make the numbers easier to use</h2>
            </div>
            <div className="overflow-hidden rounded-xl border border-lab-border bg-lab-panel">
              {researchLinks.map((item) => (
                <Link key={item.href} href={item.href} className="group grid min-h-16 grid-cols-[1fr_auto] items-center gap-4 border-b border-lab-border px-4 py-3 last:border-b-0 sm:grid-cols-[minmax(220px,.7fr)_1fr_auto] sm:px-5">
                  <span className="font-semibold text-white">{item.label}</span>
                  <span className="hidden text-sm text-lab-muted sm:block">{item.detail}</span>
                  <span className="text-sm font-semibold text-lab-lime group-hover:translate-x-1">View →</span>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-5 rounded-xl border border-lab-border bg-lab-panel p-5 sm:p-6 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <p className="tll-eyebrow">A careful research tool</p>
              <h2 className="mt-2 text-xl font-semibold text-white">Clear about what the evidence can—and cannot—say</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-lab-muted">No approved effectiveness assessment is currently available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
            </div>
            <Link href="/methodology" className="tll-secondary-button justify-self-start">Read the method</Link>
          </section>
        </div>
      </main>

    </div>
  )
}
