import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CreatineCalculator from './CreatineCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/creatine`

export const metadata: Metadata = {
  title: 'Creatine Dosage Calculator — Loading & Maintenance | The Lifting Lab',
  description:
    'Free creatine dosage calculator. Enter your bodyweight and get your exact loading and maintenance dose, how to split it, and how fast your muscles saturate — backed by the ISSN evidence.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Creatine Dosage Calculator — Loading & Maintenance | The Lifting Lab',
    description:
      'Your exact creatine dose for your bodyweight — loading and maintenance, how to split it, days to saturation. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Creatine Dosage Calculator — Loading & Maintenance | The Lifting Lab',
    description:
      'Your exact creatine dose for your bodyweight — loading, maintenance, days to saturation. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much creatine should I take per day?',
    a: 'The evidence-based maintenance dose is 3 to 5 grams of creatine monohydrate every day, and it barely changes with bodyweight. Larger lifters sit at the top of that band. That flat daily dose is all most people ever need — a loading phase is optional and only changes how fast your stores fill.',
  },
  {
    q: 'Do I need to do a loading phase?',
    a: 'No. Loading is optional. Taking around 0.3 grams per kilogram of bodyweight a day (split into 4 doses) for 5 to 7 days saturates your muscles in about a week. Skipping it and taking a flat 3 to 5 grams a day gets you to the exact same place in roughly 3 to 4 weeks. The end result is identical — loading just gets you there faster.',
  },
  {
    q: 'When is the best time to take creatine?',
    a: 'Timing does not matter for creatine. Because it works by saturating your muscles over days and weeks, what counts is taking it every single day, not the exact hour. Take it whenever you will remember — with a meal, in your shake, pre or post-workout, it makes no measurable difference.',
  },
  {
    q: 'Does creatine cause bloating, hair loss or kidney damage?',
    a: 'For healthy adults, creatine monohydrate is one of the most studied and safe supplements available. A loading phase can cause a small, temporary water-weight gain inside the muscle, not bloat. The hair-loss and kidney-damage claims are not supported by the evidence in healthy people. If you have a kidney condition or take medication, speak to a clinician first. This tool is not medical advice.',
  },
  {
    q: 'Which type of creatine is best?',
    a: 'Creatine monohydrate. It is the form used in almost every study, it is the cheapest, and no fancier version (HCl, ethyl ester, buffered) has been shown to beat it. Because the dose is small and flat, the only things that really separate products are purity and price per gram, which is exactly what our creatine ranking sorts on.',
  },
]

export default function CreatinePage() {
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQS.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Calculators', item: `${SITE}/calculators` },
      { name: 'Creatine Dosage', item: URL },
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
            <li><Link href="/calculators" className="hover:text-white">Calculators</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Creatine Dosage</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Creatine Dosage <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter your bodyweight and we&apos;ll show your exact creatine dose — the optional loading dose,
          how to split it, your daily maintenance dose, and how fast your muscles saturate.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Based on the ISSN position stand: a loading phase of around 0.3g per kg of bodyweight for a
          week, then a flat 3 to 5g a day for good. Creatine monohydrate is the most evidence-backed
          supplement there is — this tool just tells you exactly how much to take.
        </p>

        <CreatineCalculator />

        {/* sibling tools — dedicated calculator pages */}
        <div className="mt-4 grid gap-3">
          <Link
            href="/calculators/protein"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Nutrition tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Protein Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Get your daily protein target in grams for building muscle or losing fat, plus a per-meal split.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/1rm"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Strength tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                One-Rep Max Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Estimate your 1RM from any set, then get your working loads at every percentage.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Loading vs no loading</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Both routes end in exactly the same place: fully saturated muscles. A loading phase — about
              0.3g per kg of bodyweight a day, split into four doses, for 5 to 7 days — just gets you there
              in a week instead of a month. If you want the strength and power benefits sooner, load. If you
              would rather keep it dead simple, skip loading and take a flat 3 to 5g a day; you will be fully
              topped up in 3 to 4 weeks. Neither is better long term.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Your maintenance dose</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              After loading — or from day one if you skip it — you settle onto 3 to 5g of creatine
              monohydrate every single day. The dose is remarkably flat: bodyweight barely moves it, which
              is why a 65kg and a 100kg lifter can both sit in the same 3 to 5g band, with bigger athletes
              simply nearer the top. Consistency is the whole game. Miss the odd day and nothing collapses,
              but the daily habit is what keeps your stores full.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Timing and mixing</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Forget the pre-versus-post-workout debate — creatine works by cumulative saturation, so the
              clock does not matter. Take it whenever you will actually remember: stirred into your morning
              coffee, dropped in your protein shake, or alongside a meal. It dissolves best in warm liquid
              and any grittiness at the bottom of the glass is just undissolved creatine, so top up with
              water and drink it. Splitting the dose during a loading week is only to keep your stomach happy.
            </p>
          </div>
        </section>

        {/* FAQ — backs the FAQPage schema with visible content */}
        <section className="mt-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-5">
            Common <span className="text-lab-lime">questions</span>
          </h2>
          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-4 group">
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 text-sm font-bold text-white/90">
                  {f.q}
                  <span className="text-lab-lime text-lg leading-none group-open:rotate-45 transition-transform">+</span>
                </summary>
                <p className="text-lab-muted text-sm leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Now find the right tub</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            The dose is flat and the science is settled, so the only things that separate creatine
            products are purity and price per gram. Every product we track is scored 0–100 on exactly
            that — no marketing, just the numbers.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best/creatine"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best creatine 2026 →
            </Link>
            <Link
              href="/calculators"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              More calculators
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Doses are general, evidence-based starting points for
            healthy adults; if you have a health condition, are pregnant or take medication, speak to a
            clinician first. Buy links are affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
