import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import CompareView from './CompareView'
import { fetchCompareProducts, parseCompareIds } from '@/lib/product-data'

// The comparison is keyed on the ?ids= query string, so this route is rendered
// on the server per request (Next.js treats searchParams as dynamic). The
// trade-off is deliberate: the alternative — a static shell that fetches
// client-side — is exactly the spinner that in-app browsers (LIFT / Safari
// webviews) and crawlers get stuck on. Every product's name, brand, score,
// true cost, serving info, nutrients, buy CTA and image are in the HTML.
type Props = { searchParams: Promise<{ ids?: string | string[] }> }

const SITE = 'https://www.theliftinglab.co.uk'

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const ids = parseCompareIds((await searchParams).ids)
  const products = await fetchCompareProducts(ids)
  const base = {
    description:
      'Head-to-head supplement comparison. See dosing side by side and get an evidence-based verdict on which product wins.',
    alternates: { canonical: `${SITE}/compare` },
  }
  if (!products.length) return { title: 'Compare Supplements — The Lifting Lab', ...base }
  const names = products.map((p) => `${p.brand} ${p.name}`).join(' vs ')
  return {
    title: `${names} — Compare | The Lifting Lab`,
    ...base,
    description: `${names}: side-by-side dosing, Effectiveness Match scores and True Cost per serving.`,
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
            Side-by-side dosing and Effectiveness Match scores. Pick up to 3 products from the browser.
          </p>
          <p className="text-lab-muted/50 text-xs mt-1">
            Scores are for informational purposes only and do not constitute medical advice.
          </p>
        </div>
        <CompareView products={products} />
      </div>
    </div>
  )
}
