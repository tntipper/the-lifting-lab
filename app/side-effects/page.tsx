import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SafetyBoard from './SafetyBoard'
import { SAFETY, TIER_META, tierCounts, safetyQuestion } from '@/lib/side-effects'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/side-effects`

export const metadata: Metadata = {
  title: 'Supplement Side Effects & Safety UK 2026 — Is It Safe? | The Lifting Lab',
  description:
    'Is creatine safe? Does pre-workout have side effects? An honest, evidence-based safety guide to the biggest supplements — common effects, rare risks, who should be careful, and sensible doses.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Side Effects & Safety UK 2026 — Is It Safe?',
    description:
      'Creatine, pre-workout, whey, ashwagandha, fat burners and more — the real side effects and who should be careful, scored well tolerated, use sensibly or real caution.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Side Effects & Safety UK 2026 — Is It Safe?',
    description:
      'The real side effects of the biggest supplements, each with an honest safety verdict and sensible dosing.',
  },
}

export default function SideEffectsPage() {
  const counts = tierCounts()

  // FAQPage schema, backed 1:1 by the detail text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SAFETY.map((s) => ({
      '@type': 'Question',
      name: safetyQuestion(s.name),
      acceptedAnswer: { '@type': 'Answer', text: s.detail },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Side Effects & Safety', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

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
            <li aria-current="page" className="text-white/80">Side Effects &amp; Safety</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Side Effects &amp; Safety
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Side Effects</span> &amp; Safety
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          &ldquo;Is it safe?&rdquo; is the first honest question about any supplement. Here are the
          biggest ones, each with its real side effects, the rare risks worth knowing, who should be
          careful, and the sensible dose that keeps trouble to a minimum — scored in the same green,
          amber and red we use on products.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Of the {SAFETY.length} supplements below, {counts['well-tolerated']} are
          {' '}{TIER_META['well-tolerated'].noun}, {counts['use-sensibly']} are
          {' '}{TIER_META['use-sensibly'].noun}, and {counts.caution} genuinely
          {' '}{TIER_META.caution.noun}. Tap any one for the full picture.
        </p>

        {/* tier legend */}
        <div className="grid gap-2 mb-8">
          {(['well-tolerated', 'use-sensibly', 'caution'] as const).map((tier) => {
            const t = TIER_META[tier]
            return (
              <div
                key={tier}
                className="flex items-start gap-3 bg-lab-panel border border-lab-border rounded-xl p-3"
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}66` }}
                >
                  {t.label}
                </span>
                <p className="text-xs text-lab-muted leading-snug">{t.blurb}</p>
              </div>
            )
          })}
        </div>

        <SafetyBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Most side effects are about dose and form</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The majority of supplement side effects are not signs of danger — they are signs of too
              much, or the wrong form. The whey bloating is usually lactose in a cheap concentrate; the
              magnesium diarrhoea is usually the oxide form; the pre-workout jitters are usually stacked
              caffeine. Lower the dose, split it, take it with food, or switch to a better form, and most
              complaints disappear.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where a real supplement risk lives</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The genuine risks cluster in two places: high-stimulant products with opaque proprietary
              blends (fat burners, some pre-workouts), and megadosing things the body stores rather than
              clears (fat-soluble vitamins, iron). Everything with a clear single ingredient and a
              sensible dose — creatine, whey, omega-3, most vitamins — sits at the safe end of the scale.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              These profiles are general and evidence-based for healthy adults, and they are about
              supplements, not medicine. Existing kidney, liver, heart or thyroid conditions, pregnancy
              and breastfeeding, and anything you take alongside prescription medication are all matters
              for a qualified clinician or pharmacist — not a tub off a shelf, and not this page.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/combine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Can I Take X With Y?</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Side effects are one supplement at a time; the combine checker covers what happens when you stack two.
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
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Myths vs Facts</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Does creatine cause hair loss? Are test boosters real? The scares and claims, given honest verdicts.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/testosterone"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Testosterone Support</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Which testosterone boosters actually work, which are weak, and which to skip — the honest, evidence-based verdict.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Skip the risky stuff, get the proven few right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            The safest supplements are usually the proven ones with a single clear ingredient. Every
            product we track is scored 0&ndash;100 on how closely it matches the evidence — or let the
            wizard build a clean, sensible stack for you in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Build my stack →
            </Link>
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Best of 2026
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Safety profiles are general and evidence-based for
            healthy adults; if you take medication, have a health condition, are pregnant or
            breastfeeding, speak to a clinician or pharmacist first.
          </p>
        </section>
      </main>
    </div>
  )
}
