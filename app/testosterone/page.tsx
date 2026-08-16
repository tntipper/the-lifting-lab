import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import TestosteroneBoard from './TestosteroneBoard'
import { TEST_ITEMS, itemCount, tierCount, testQuestion } from '@/lib/testosterone'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/testosterone`

export const metadata: Metadata = {
  title: 'Natural Testosterone Support UK 2026 — What Actually Works | The Lifting Lab',
  description:
    'An honest, evidence-based rating of natural testosterone supplements and habits: what really helps (sleep, body fat, vitamin D, zinc, ashwagandha), what is weak, and the boosters to skip (tribulus, DAA, blends). Not medical advice.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Natural Testosterone Support — What Actually Works',
    description:
      'Sleep, body fat, vitamin D, zinc and ashwagandha vs tribulus, DAA and "test booster" blends. The honest, evidence-based verdict on boosting testosterone naturally.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Natural Testosterone Support — What Actually Works',
    description:
      'The evidence-based verdict on natural testosterone supplements and habits — the real levers, the weak bets, and the boosters to skip.',
  },
}

export default function TestosteronePage() {
  // FAQPage schema, backed 1:1 by the detail text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: TEST_ITEMS.map((item) => ({
      '@type': 'Question',
      name: testQuestion(item.name),
      acceptedAnswer: { '@type': 'Answer', text: `${item.detail} ${item.bottomLine}` },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Testosterone Support', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const worksN = tierCount('works')

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <main className="max-w-2xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Testosterone Support</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Natural Testosterone Support
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Boost Your <span className="text-lab-lime">Testosterone</span> — What Actually Works
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The supplement aisle is full of &ldquo;testosterone boosters&rdquo;, and most of them are built on
          ingredients that fail in the research. Here is the honest version: the handful of habits and
          supplements with real evidence behind them, the weak bets, and the ones to skip — scored in the
          same green, amber and red we use on products.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {itemCount()} of the most-searched testosterone levers below, and only {worksN} carry real
          evidence — most of those are habits, not pills. Tap any one for the full verdict.
        </p>

        {/* clinical callout — this is a health-adjacent topic, so it leads, not hides in the footer */}
        <div
          className="rounded-2xl p-5 mb-8 border"
          style={{ borderColor: 'rgba(245,166,35,0.35)', background: 'rgba(245,166,35,0.06)' }}
        >
          <p className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: '#f5a623' }}>
            Read this first
          </p>
          <p className="text-sm text-white/85 leading-relaxed">
            Genuinely low testosterone is a medical diagnosis, not a vibe. If you have symptoms like
            persistent low libido, fatigue, low mood or erectile issues, that needs a blood test and a
            doctor — no supplement replaces that. TRT is a prescribed medical treatment and a tub of powder
            does not replicate it. Everything below is general, evidence-based information for supporting
            healthy testosterone, not medical advice.
          </p>
        </div>

        {/* verdict legend */}
        <div className="grid gap-2 mb-8">
          {(['works', 'maybe', 'skip'] as const).map((v) => {
            const m = {
              works: { label: 'Real Evidence', color: '#a6e22e', blurb: 'Genuinely helps — usually by fixing a deficiency or a lifestyle leak, not by pushing a normal level higher.' },
              maybe: { label: 'Weak / Situational', color: '#f5a623', blurb: 'Some evidence or a plausible mechanism, but small, mixed, or only relevant in specific cases.' },
              skip: { label: 'Skip It', color: '#e05a2b', blurb: 'Repeatedly fails in decent trials, or is a marketing blend built on ingredients that already failed.' },
            }[v]
            return (
              <div
                key={v}
                className="flex items-start gap-3 bg-lab-panel border border-lab-border rounded-xl p-3"
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}66`, minWidth: 92, textAlign: 'center' }}
                >
                  {m.label}
                </span>
                <p className="text-xs text-lab-muted leading-snug">{m.blurb}</p>
              </div>
            )
          })}
        </div>

        <TestosteroneBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The biggest levers are not on a shelf</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The uncomfortable truth for the supplement industry is that the things that move testosterone
              most are free: enough sleep, a healthy body-fat level, regular resistance training and going
              easy on alcohol. Sort those and you have done more than any &ldquo;booster&rdquo; tub can. Supplements only
              earn a place on top of those foundations, and mostly by plugging a genuine gap.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">&ldquo;Fixing a shortfall&rdquo; is not the same as &ldquo;boosting&rdquo;</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Vitamin D, zinc and magnesium can help — but only if you were short to begin with. Correcting a
              real deficiency lets testosterone return to its normal level; it does not push a normal level
              past normal, and taking mega-doses on top of a healthy baseline does nothing useful. That is
              why the honest verdict on the nutrients is &ldquo;worth it as insurance&rdquo;, not &ldquo;buy this to get big&rdquo;.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is general, evidence-based information, not medical advice or a diagnosis. Genuine low
              testosterone, TRT, DHEA and any decision about hormones — including if these supplements
              interact with a medication or health condition — are matters for a doctor or pharmacist who can
              test and monitor, not a label or an article.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/peptides"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Peptides, Honestly</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                BPC-157, TB-500, GLP-1s and the rest — what is proven, what is legal, and what to avoid, in the same honest grammar.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/myths"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Myths, Debunked</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                This page rates the testosterone claims; the myths hub takes on the biggest supplement claims across the board.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/stacks/men-over-40"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Best Supplements for Men Over 40</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The evidence-based, no-nonsense stack for older lifters — real picks, honest on the hormone claims.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/side-effects"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Side Effects &amp; Safety</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Before you take anything above, the honest safety profile of each supplement and who should be careful.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Buy the few things that help, done right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            If a supplement earns its place — vitamin D or zinc for a shortfall, a standardised ashwagandha —
            the job is buying it at a proper dose without overpaying. Every product we track is scored
            0&ndash;100 on how closely it matches the evidence, with the true cost per effective serving, or
            let the wizard build a clean, sensible stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products?category=hormone-support"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Browse hormone support →
            </Link>
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Build my stack
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Genuine low testosterone, TRT and any hormone decision
            are matters for a clinician who can test and monitor; supplement effects are general and
            evidence-based for healthy adults, and any interaction with a medication or health condition is a
            question for a doctor or pharmacist.
          </p>
        </section>
      </main>
    </div>
  )
}
