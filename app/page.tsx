import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CategoryGrid from '@/components/CategoryGrid'
import ShopHero from '@/components/ShopHero'
import TopProductsTable from '@/components/TopProductsTable'
import { fetchCatalogue } from '@/lib/product-data'
import styles from '@/components/ShopHome.module.css'

export const metadata: Metadata = {
  title: 'The Lifting Lab — Supplement research',
  description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
  alternates: { canonical: 'https://theliftinglab.co.uk' },
  openGraph: {
    title: 'The Lifting Lab — Supplement research',
    description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
    url: 'https://theliftinglab.co.uk',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'The Lifting Lab — Supplement research',
    description: 'Browse supplement labels, unverified historical records and listed prices. Approved effectiveness recommendations are unavailable; manual research stacks remain usable.',
  },
}

const SITE = 'https://theliftinglab.co.uk'

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

export default async function Home() {
  const products = await fetchCatalogue()
  return (
    <div data-theme="lab" className={styles.home}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(orgLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(websiteLd) }} />
      <TopNav />

      <ShopHero products={products} shopHref="/products" />

      <main className={styles.main}>
        <section aria-labelledby="category-heading" className={styles.section}>
          <h2 id="category-heading">Shop by category</h2>
          <CategoryGrid products={products} variant="home" />
        </section>

        <TopProductsTable products={products} />

        <section id="method" aria-labelledby="method-heading" className={`${styles.section} ${styles.methodSection}`}>
          <h2 id="method-heading">How we score</h2>
          <div className={styles.methods}>
            {[
              ['Match the dose', 'Each active ingredient is scored against the dose used in published research. Proprietary blends that hide amounts score low.'],
              ['Work out the true cost', 'Price divided by effective servings: what one properly dosed serving actually costs you, not what the tub says.'],
              ['Check every price', 'We list what UK retailers charge beside our own price. If someone is cheaper, the card says so.'],
            ].map(([title, description], index) => (
              <article key={title} className={styles.method}>
                <span className={styles.methodNumber}>{String(index + 1).padStart(2, '0')}</span>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
          <p className={styles.note}>This describes the scoring method. Approved effectiveness assessments are currently unavailable; listed serving costs are shown until reviews are complete.</p>
          <Link href="/methodology" className={styles.textLink}>Read the full method</Link>
        </section>
      </main>

    </div>
  )
}
