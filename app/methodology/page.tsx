import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ClaimsReviewNotice from '@/components/ClaimsReviewNotice'
import { METHODOLOGY, METHODOLOGY_INDEX } from '@/lib/methodology'
import { claimsReviewFor } from '@/lib/claims-review'
import { serializeJsonForHtml } from '@/lib/json-for-html'

const url = 'https://www.theliftinglab.co.uk/methodology'
const description = 'Historical formula inputs remain available for review. No approved effectiveness assessment exists; historical percentages do not establish dosing, quality or product recommendations.'
export const metadata: Metadata = {
  title: 'Historical Scoring Methodology — Review Incomplete', description,
  alternates: { canonical: url },
  openGraph: { title: 'Historical Scoring Methodology — Review Incomplete', description, url, type: 'article' },
  twitter: { card: 'summary_large_image', title: 'Historical Scoring Methodology — Review Incomplete', description },
}
const FAQ = [
  { q: 'What does a historical percentage mean?', a: 'It is an unverified output from the previous formula. A positive percentage is not an approved assessment, effective-dose finding, safety assessment or product recommendation.' },
  { q: 'Can historical scores choose a product for me?', a: 'No. Effectiveness rankings, quality colours, best-product awards and score-per-pound recommendations are unavailable. Browse recorded labels or maintain a manual research stack while scientific review remains incomplete.' },
  { q: 'What do price-only comparisons show?', a: 'They divide a positive listed price by known serving or recorded protein data. They exclude delivery and checkout costs. Different formulas or serving sizes may not be equivalent, and the calculation does not approve an offer or demonstrate a health benefit.' },
  { q: 'What is needed before effectiveness recommendations return?', a: 'A reviewed assessment must bind the exact product formulation and label, methodology version, relevant evidence, uncertainty and accountable approval. The frozen percentage, product category or a caller-provided approval flag cannot substitute for that review.' },
]
export default function MethodologyPage() {
  const faq = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) }
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(faq) }} />
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml({ '@context': 'https://schema.org', '@type': 'WebPage', name: 'Historical Scoring Methodology', description, url }) }} />
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <h1 className="text-3xl font-black">Historical scoring methodology</h1><p>{description}</p>
      <p className="text-lab-muted">Historical values use a neutral display. Missing or unusable values are marked Not assessed; category claim holds remain Under review. None of these states means approved. Explicit nutrient cautions and recorded label amounts remain available separately.</p>
      <div className="flex flex-wrap gap-4"><Link className="underline" href="/products">Product research records</Link><Link className="underline" href="/cheapest">Listed prices only</Link><Link className="underline" href="/stack">Manual research stack</Link></div>
      <section className="space-y-6"><h2 className="text-xl font-bold">Historical formula inputs — unverified</h2>
        <p className="text-lab-muted">The original stored targets and weights are preserved below for inspection. They describe the previous formula, not approved reference doses or dosing recommendations.</p>
        {METHODOLOGY_INDEX.map(entry => { const method = METHODOLOGY[entry.key]; if (!method) return null; return <section key={entry.key} className="border border-lab-border bg-lab-panel rounded-xl p-4 space-y-3">
          <h3 className="font-bold">{entry.title}</h3><ClaimsReviewNotice category={entry.categorySlug} />
          <p className="text-xs text-lab-muted">{claimsReviewFor(entry.categorySlug) ? 'Legacy weights under review' : 'Historical weights — unverified'}</p>
          {method.rows.map(row => <div key={row.ingredient} className="flex flex-wrap gap-2 text-sm text-lab-muted border border-lab-border rounded-lg p-2"><span className="flex-1 min-w-0">{row.ingredient}</span><span>{row.target}</span><span>{row.weight}</span></div>)}
          <Link className="inline-flex min-h-11 items-center underline text-sm" href={`/products?category=${entry.categorySlug}`}>Browse recorded labels</Link>
        </section> })}
      </section>
      <section className="space-y-4"><h2 className="text-xl font-bold">Common questions</h2>{FAQ.map(f => <section key={f.q}><h3 className="font-bold">{f.q}</h3><p className="text-lab-muted">{f.a}</p></section>)}</section>
    </main></div>
}
