import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import DotsCalculator from './DotsCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/dots`

export const metadata: Metadata = {
  title: 'DOTS Calculator — Relative Strength Score (the modern Wilks) | The Lifting Lab',
  description:
    'Free DOTS calculator. Score your squat, bench and deadlift total against your bodyweight to compare relative strength across any weight or sex. DOTS is the IPF-adopted successor to the Wilks score.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'DOTS Calculator — Relative Strength Score | The Lifting Lab',
    description:
      'Score your powerlifting total against your bodyweight on the DOTS scale — the modern, sex-fair replacement for Wilks. Instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'DOTS Calculator — Relative Strength Score | The Lifting Lab',
    description:
      'Score your total against your bodyweight on the DOTS scale — the modern replacement for Wilks. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'What is a DOTS score?',
    a: 'DOTS is a coefficient that normalises your powerlifting total (squat + bench + deadlift) against your bodyweight, so lifters of any size can be compared on one scale. It multiplies your total by 500 and divides by a fourth-degree polynomial of your bodyweight. A higher DOTS means more strength relative to how much you weigh.',
  },
  {
    q: 'Is DOTS better than the Wilks score?',
    a: 'DOTS is the more modern formula and has been adopted by the IPF as the successor to Wilks. It was refitted on newer competition data and uses a single set of coefficients per sex, which many lifters find fairer across bodyweights. Wilks scores are still widely quoted, but DOTS is what most federations now default to.',
  },
  {
    q: 'What is a good DOTS score?',
    a: 'As a rough guide, beginners sit under 200, intermediates around 200 to 300, and advanced lifters 300 to 400. Past roughly 400 is elite, competitive territory. These bands are general orientation, not official standards — your own trend over time matters far more than any single number.',
  },
  {
    q: 'Does the DOTS formula work in pounds?',
    a: 'The formula is defined in kilograms, so we convert your figures for you. Enter everything in whichever unit you prefer using the kg/lb toggle, and the score stays on the same standard scale either way.',
  },
  {
    q: 'Which supplements actually raise my total?',
    a: 'For strength and power, creatine monohydrate at 3 to 5 grams a day is the most evidence-backed supplement there is, and a caffeinated pre-workout can lift acute performance. Everything else is a distant second to consistent training, sleep, and enough protein. This tool is a training guide, not medical advice.',
  },
]

export default function DotsPage() {
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
      { name: 'DOTS Score', item: URL },
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
            <li aria-current="page" className="text-white/80">DOTS Score</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          DOTS <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter your bodyweight and your best squat, bench and deadlift, and we&apos;ll score your total
          on the DOTS scale — the modern, sex-fair way to compare relative strength across any bodyweight.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. DOTS is the coefficient the IPF adopted to replace the old Wilks score,
          so it&apos;s what most federations now quote.
        </p>

        <DotsCalculator />

        {/* sibling tools — dedicated calculator pages */}
        <div className="mt-4 grid gap-3">
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
                Estimate your 1RM from any set, then get your training loads at every percentage.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/tdee"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Nutrition tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                TDEE &amp; Macro Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Find your maintenance calories, then your protein, carb and fat targets for any goal.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What DOTS actually measures</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Raw totals reward being heavy. A 200kg squat from a 120kg lifter and the same squat from
              a 70kg lifter are not the same feat, and DOTS is how you separate them. It takes your full
              powerlifting total and scales it against your bodyweight, returning a single number that
              lets you compare yourself to anyone, at any weight, of either sex.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why DOTS replaced Wilks</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The Wilks coefficient ruled powerlifting for decades, but critics argued it treated some
              bodyweight classes unfairly as training standards rose. DOTS was fitted on newer data with
              one clean formula per sex, and the IPF adopted it as the modern replacement. If you have
              only ever seen a Wilks score, DOTS is the like-for-like number the sport now defaults to.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">How to read your number</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              As a rough orientation, under 200 is beginner, 200 to 300 is intermediate, 300 to 400 is
              advanced, and past 400 is elite. Treat those bands loosely — the real value of DOTS is
              tracking your own score over months. If it climbs while your bodyweight holds, you are
              genuinely getting stronger, not just heavier.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Want to move the number?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Training drives your total — but creatine and a solid pre-workout are the two supplements
            with real evidence behind them. Every product we track is scored 0–100 on how closely its
            doses match that evidence.
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
            Informational only — not medical or coaching advice. Strength-level bands are a general
            guide, not official standards. Buy links are affiliate links; we may earn a commission at
            no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
