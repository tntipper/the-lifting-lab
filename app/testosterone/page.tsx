import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { serializeJsonForHtml } from '@/lib/json-for-html'
import { CLAIM_SOURCES, TESTOSTERONE_REVIEW } from '@/lib/claims-review'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/testosterone`
const { title, description, faqs } = TESTOSTERONE_REVIEW

export const metadata: Metadata = {
  title: `${title} | The Lifting Lab`,
  description,
  alternates: { canonical: URL },
  openGraph: { title, description, url: URL, type: 'website', siteName: 'The Lifting Lab' },
  twitter: { card: 'summary_large_image', title, description },
}

export default function TestosteronePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question', name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  }
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE }, { name: 'Testosterone Information', item: URL },
    ].map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, ...crumb })),
  }
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumbJsonLd) }} />
      <main className="max-w-2xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="text-xs text-lab-muted mb-6">
          <Link href="/" className="hover:text-white">Home</Link> / Testosterone Information
        </nav>
        <p className="text-xs uppercase tracking-widest font-bold text-yellow-400 mb-4">Claims under review</p>
        <h1 className="text-3xl sm:text-4xl font-black leading-tight mb-6">{title}</h1>
        <p className="text-lg text-white/90 leading-relaxed mb-6">{description}</p>
        <aside className="rounded-2xl border border-yellow-500/40 bg-yellow-500/5 p-5 mb-8">
          <h2 className="text-sm font-bold mb-2">Clinical assessment comes first</h2>
          <p className="text-sm text-white/80 leading-relaxed">
            If you are concerned about low testosterone, speak to a clinician. Supplements cannot
            diagnose a hormone disorder or replace prescribed treatment. Ask a pharmacist or clinician
            about medicines, health conditions and supplement interactions before use.
          </p>
        </aside>
        <div className="space-y-8">
          {faqs.map((faq, index) => (
            <section key={faq.q}>
              <h2 className="text-lg font-bold mb-2">{faq.q}</h2>
              <p className="text-sm text-lab-muted leading-relaxed">{faq.a}</p>
              {index > 0 && (
                <a className="inline-block mt-2 text-xs text-lab-lime underline" href={index === 1 ? CLAIM_SOURCES.ashwagandha.url : CLAIM_SOURCES.testosterone.url}>
                  {index === 1 ? CLAIM_SOURCES.ashwagandha.title : CLAIM_SOURCES.testosterone.title}
                </a>
              )}
            </section>
          ))}
        </div>
        <section className="mt-10 border-t border-lab-border pt-6">
          <h2 className="text-lg font-bold mb-2">What happens next</h2>
          <p className="text-sm text-lab-muted leading-relaxed">
            Each claim needs a traceable review of the exact preparation, study population, measured
            outcome and safety limitations before ingredient verdicts or product recommendations return.
            This interim update is not scientific sign-off of TLL&apos;s scoring system.
          </p>
          <Link href="/methodology" className="inline-block mt-4 text-sm text-lab-lime underline">Read the current methodology and review notices</Link>
          <p className="mt-5 text-xs text-lab-muted">General information only; not medical advice.</p>
        </section>
      </main>
    </div>
  )
}
