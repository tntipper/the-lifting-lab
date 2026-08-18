import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import DosageBoard from './DosageBoard'
import { DOSE_ITEMS, itemCount, tierCount, doseQuestion } from '@/lib/dosage'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/dosage`

export const metadata: Metadata = {
  title: 'Supplement Dosage Guide UK 2026 — How Much of Everything to Take | The Lifting Lab',
  description:
    'The evidence-based dosage cheat sheet: how much creatine, caffeine, protein, beta-alanine, citrulline, vitamin D, zinc, magnesium and more to take, when, and in which form. Plus the honest "more is not better" ceiling on each.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Dosage Guide — How Much of Everything to Take',
    description:
      'One scannable chart of evidence-based doses: creatine, caffeine, protein, beta-alanine, citrulline, vitamin D, zinc and more — the dose, the timing, the form, and where more stops helping.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Dosage Guide — How Much of Everything to Take',
    description:
      'The evidence-based dose, timing and form for every major supplement in one honest chart.',
  },
}

export default function DosagePage() {
  // FAQPage schema, backed 1:1 by the dose + detail text rendered in the board.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: DOSE_ITEMS.map((item) => ({
      '@type': 'Question',
      name: doseQuestion(item.name),
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${item.dose}, ${item.timing.toLowerCase()}. ${item.detail}`,
      },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Supplement Dosage Guide', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const strongN = tierCount('strong')

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
            <li aria-current="page" className="text-white/80">Supplement Dosage Guide</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Dosage Cheat Sheet
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          How Much of <span className="text-lab-lime">Everything</span> to Take
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The label tells you what is in the tub. It rarely tells you the dose that actually does something
          in the research — or where taking more stops helping and starts wasting money. This is the whole
          supplement aisle on one page: the evidence-based dose, when to take it, which form to buy, and the
          honest ceiling on each.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {itemCount()} of the most-searched supplements below, scored in the same green, amber and red we use
          on products — {strongN} carry strong evidence at the dose shown. Tap any one for the full breakdown.
        </p>

        {/* clinical callout — this is health-adjacent, so it leads, not hides in the footer */}
        <div
          className="rounded-2xl p-5 mb-8 border"
          style={{ borderColor: 'rgba(245,166,35,0.35)', background: 'rgba(245,166,35,0.06)' }}
        >
          <p className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: '#f5a623' }}>
            Read this first
          </p>
          <p className="text-sm text-white/85 leading-relaxed">
            These are general, evidence-based starting doses for healthy adults, not personalised medical
            advice. Some figures scale with your bodyweight, and some supplements interact with medications or
            health conditions. If you are pregnant, take medication, or have a health condition, check with a
            doctor or pharmacist before starting anything — and note that melatonin is a prescription-only
            medicine in the UK.
          </p>
        </div>

        {/* verdict legend */}
        <div className="grid gap-2 mb-8">
          {(['strong', 'moderate', 'weak'] as const).map((v) => {
            const m = {
              strong: { label: 'Strong Evidence', color: '#a6e22e', blurb: 'Consistently works at the dose shown in good human trials — worth taking if it fits your goal.' },
              moderate: { label: 'Moderate / Situational', color: '#f5a623', blurb: 'Real but smaller or context-dependent evidence — helps in specific cases or fixes a shortfall.' },
              weak: { label: 'Weak / Skippable', color: '#e05a2b', blurb: 'Thin evidence, or redundant once the basics are covered. Rarely worth the money for most people.' },
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

        <DosageBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The dose is where the marketing hides</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Most disappointing supplements are not fake — they are underdosed. A pre-workout can list every
              proven ingredient and still do nothing because each is a fraction of the amount that was studied.
              That is the whole reason this site scores products on how closely their doses match the evidence,
              not on what is printed on the front of the tub. Knowing the target dose is how you read past the
              label.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">More is almost never better</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Nearly every supplement here has a point where extra does nothing — creatine and beta-alanine
              saturate, caffeine tips into jitters and lost sleep, water-soluble vitamins are simply urinated
              out, and fixing a mineral shortfall helps while megadosing on top of a normal level does not.
              Doubling a dose almost always buys side effects or waste, not results. Hit the effective number
              and stop.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is general, evidence-based information for healthy adults, not a prescription. Doses that
              depend on your bodyweight, any interaction with a medication or condition, and anything
              prescription-only such as melatonin in the UK are matters for a clinician who can assess you, not
              a chart.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/calculators"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Dosage Calculators</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Want your exact number? The creatine, beta-alanine, citrulline, caffeine and protein calculators do the maths for your bodyweight.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/calculators/timing"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Timing Planner</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                This page covers how much; the timing planner builds a daily schedule around when you train — and flags the timing myths you can ignore.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/combine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Combination Checker</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Got your doses right? Now check you can take them together — the honest verdict on mixing supplements, plus the double-dosing traps.
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
                The honest safety profile of each supplement — the common and rare effects, and who should be careful before dosing.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Now buy the ones dosed right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Knowing the target dose is only half the job — the other half is finding a product that actually
            hits it without overpaying. Every supplement we track is scored 0&ndash;100 on how closely it
            matches the evidence, with the true cost per effective serving, or let the wizard build a clean,
            properly-dosed stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best-scoring products →
            </Link>
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Build my stack
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Doses are general starting points for healthy adults;
            anything bodyweight-scaled, prescription-only, or affecting a medication or health condition is a
            question for a clinician. Buy links are affiliate links; we may earn a commission at no extra cost
            to you.
          </p>
        </section>
      </main>
    </div>
  )
}
