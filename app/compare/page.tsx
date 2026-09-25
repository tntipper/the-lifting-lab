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
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wide">
            {names.length > 0 ? (
              <>
                {names.map((n, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-lab-lime"> vs </span>}
                    {n}
                  </span>
                ))}
              </>
            ) : (
              <>
                Head-to-<span className="text-lab-lime">Head</span>
              </>
            )}
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            Compare recorded label amounts and listed prices for up to 3 products.
          </p>
          <p className="text-lab-muted/50 text-xs mt-1">
            No approved effectiveness assessment or winner is available.
          </p>
        </div>
        <CompareView products={products} />
      </div>
    </div>
  )
}
