import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { buildFaqTopics, faqTotalCount } from '@/lib/faq'

const SITE = 'https://www.theliftinglab.co.uk'

export const metadata: Metadata = {
  title: 'Supplement Questions Answered — Doses, Timing & Safety | The Lifting Lab',
  description:
    'Straight, evidence-based answers to the most common UK supplement questions: how much creatine to take, when to have whey, whether pre-workout is safe, and more.',
  alternates: { canonical: `${SITE}/faq` },
  openGraph: {
    title: 'Supplement Questions Answered | The Lifting Lab',
    description:
      'Evidence-based answers to common supplement questions — doses, timing, safety and what actually works. UK-focused.',
    url: `${SITE}/faq`,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
}

export default function FaqHub() {
  const topics = buildFaqTopics()
  const total = faqTotalCount(topics)

  // FAQPage schema — every entry below is rendered visibly on the page, so the
  // markup is backed 1:1 by on-page content (Google's requirement).
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: topics.flatMap((t) =>
      t.items.map((it) => ({
        '@type': 'Question',
        name: it.q,
        acceptedAnswer: { '@type': 'Answer', text: it.a },
      }))
    ),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: `${SITE}` },
      { name: 'Answers', item: `${SITE}/faq` },
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
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="max-w-4xl mx-auto px-6 py-12">
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">Home</Link>
            </li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Answers</li>
          </ol>
        </nav>

        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Supplement Answers
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-3">
          Your supplement <span className="text-lab-lime">questions</span>, answered
        </h1>
        <p className="text-lab-muted max-w-2xl mb-6">
          {total} plain-English, evidence-based answers to the questions lifters actually ask —
          how much to take, when to take it, what is safe, and what genuinely works. Every answer
          links through to the full ingredient guide or category breakdown behind it.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Want the deeper detail?{' '}
          <Link href="/ingredients" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Ingredient library
          </Link>{' '}
          ·{' '}
          <Link href="/guide" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Buyer&apos;s guides
          </Link>{' '}
          ·{' '}
          <Link href="/glossary" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Label glossary
          </Link>{' '}
          ·{' '}
          <Link href="/myths" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Myths vs facts
          </Link>
        </p>

        {/* Table of contents — jump links */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 mb-12">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            Jump to a topic
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {topics.map((t) => (
              <li key={t.key}>
                <a
                  href={`#${t.key}`}
                  className="text-sm font-bold text-white/80 hover:text-lab-lime transition-colors"
                >
                  {t.title}
                  <span className="text-lab-muted font-normal"> ({t.items.length})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-14">
          {topics.map((t) => (
            <section key={t.key} id={t.key} className="scroll-mt-24">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-1.5">{t.title}</h2>
              <p className="text-sm text-lab-muted mb-6 max-w-2xl">{t.blurb}</p>

              <div className="space-y-4">
                {t.items.map((it, i) => (
                  <div key={i} className="bg-lab-panel border border-lab-border rounded-2xl p-6">
                    <h3 className="text-base font-black text-white mb-2">{it.q}</h3>
                    <p className="text-sm text-white/70 leading-relaxed mb-3">{it.a}</p>
                    <Link
                      href={it.sourceHref}
                      className="inline-block text-[11px] uppercase tracking-widest font-bold text-lab-lime hover:underline underline-offset-2"
                    >
                      More: {it.sourceLabel} →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Funnel out to the money surfaces */}
        <div className="mt-16 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            Ready to pick a product?
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/best" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Best Supplements 2026 →</Link>
            <Link href="/value" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Best Value →</Link>
            <Link href="/wizard" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Find My Stack →</Link>
            <Link href="/products" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Browse all →</Link>
          </div>
        </div>

        <p className="text-lab-muted/70 text-xs mt-10 leading-relaxed max-w-2xl">
          These answers are educational and not medical advice. Doses reflect general evidence for
          healthy adults; if you take medication, have a health condition, or are pregnant, check
          with a qualified clinician before starting a supplement.
        </p>
      </div>
    </div>
  )
}
