import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import CompareView from './CompareView'
import { fetchCompareProducts, parseCompareIds } from '@/lib/product-data'

// The comparison is keyed on the ?ids= query string, so this route is rendered
// on the server per request (Next.js treats searchParams as dynamic). The
// trade-off is deliberate: the alternative — a static shell that fetches
// client-side — is exactly the spinner that in-app browsers (LIFT / Safari
// webviews) and crawlers get stuck on. Product names, brands, listed costs,
// serving info, nutrients, offer status and images are in the HTML.
type Props = { searchParams: Promise<{ ids?: string | string[] }> }

const SITE = 'https://www.theliftinglab.co.uk'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const ids = parseCompareIds((await searchParams).ids)
  const products = await fetchCompareProducts(ids)
  const base = {
    description:
      'Compare recorded supplement labels and listed prices side by side. No approved effectiveness winner is available.',
    alternates: { canonical: `${SITE}/compare` },
  }
  if (!products.length) return { title: 'Compare Supplements — The Lifting Lab', ...base }
  const names = products.map((p) => `${p.brand} ${p.name}`).join(' vs ')
  return {
    title: `${names} — Compare | The Lifting Lab`,
    ...base,
    description: `${names}: compare recorded label amounts and listed cost per serving. Effectiveness assessments are unavailable.`,
  }
}

export default async function ComparePage({ searchParams }: Props) {
  const ids = parseCompareIds((await searchParams).ids)
  const products = await fetchCompareProducts(ids)
  const names = products.map((p) => `${p.brand} ${p.name}`)

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <section className="tll-on-dark tll-dark-section border-b border-[#2a2c26]">
        <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
          <p className="text-xs font-semibold uppercase tracking-[.08em] text-[#a9ac9f]">Compare up to three products</p>
          <h1 className="tll-display mt-2 text-4xl leading-none text-white sm:text-5xl">
            {names.length ? names.join(' vs ') : 'Product comparison'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#a9ac9f]">
            Compare recorded pack prices, servings and label amounts in the same order across every product.
          </p>
        </div>
      </section>
      <main className="mx-auto max-w-7xl px-5 py-8 sm:px-6 sm:py-10">
        <CompareView products={products} />
      </main>
    </div>
  )
}
