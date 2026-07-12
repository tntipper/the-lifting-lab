import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import Calculator1RM from './Calculator1RM'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/1rm`

export const metadata: Metadata = {
  title: 'One-Rep Max Calculator (1RM) — Estimate Your Max & Training Loads | The Lifting Lab',
  description:
    'Free 1RM calculator. Enter a weight and reps to estimate your one-rep max across the Epley, Brzycki and Lombardi formulas, plus a full percentage chart of your working loads.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'One-Rep Max (1RM) Calculator — The Lifting Lab',
    description:
      'Estimate your one-rep max from any set, then get your exact training loads at every percentage. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'One-Rep Max (1RM) Calculator — The Lifting Lab',
    description:
      'Estimate your one-rep max from any set, then get your training loads at every percentage. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How do you calculate a one-rep max?',
    a: 'A one-rep max (1RM) is the most weight you can lift for a single rep. Rather than testing a true max, which is fatiguing and risky, you can estimate it from a submaximal set. Our calculator averages three established formulas — Epley, Brzycki and Lombardi — because each drifts slightly differently and the mean is more reliable than any one alone.',
  },
  {
    q: 'How accurate is an estimated 1RM?',
    a: 'Very accurate at low reps and less so as reps climb. Estimates are most reliable at about 5 reps or fewer; past 10 to 12 reps, form breakdown and endurance start to distort the number, which is why we cap the input at 12 reps. Treat the figure as a close training guide, not a certified max.',
  },
  {
    q: 'What are the percentages for?',
    a: 'Once you know your 1RM, you can programme every session off it. Heavy strength work typically sits at 85 percent or more of your max for low reps, while muscle-building work lives around 70 to 80 percent. The load table turns your estimated max into the exact working weights for each percentage.',
  },
  {
    q: 'Which supplements actually help me lift more?',
    a: 'For raw strength and power, creatine monohydrate is the most evidence-backed supplement there is, at 3 to 5 grams a day. A caffeinated pre-workout can also lift acute performance and perceived effort. Everything else is a distant second to consistent training, sleep and enough protein.',
  },
  {
    q: 'Is this medical or coaching advice?',
    a: 'No. It is a general, evidence-based training tool for healthy adults, not personalised coaching or medical advice. Always warm up, use a spotter or safety pins when working near your max, and stop if a lift feels unsafe.',
  },
]

export default function OneRepMaxPage() {
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
      { name: 'One-Rep Max', item: URL },
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
            <li aria-current="page" className="text-white/80">One-Rep Max</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          One-Rep Max <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter a weight and the reps you hit, and we&apos;ll estimate your one-rep max across three
          proven formulas — then hand you the exact training loads for every percentage of that max.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. Skip the risky true-max test and programme your sessions off a solid
          estimate instead.
        </p>

        <Calculator1RM />

        {/* sibling tool — dedicated TDEE/macros page */}
        <Link
          href="/calculators/tdee"
          className="mt-4 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
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

        {/* sibling tool — dedicated DOTS relative-strength page */}
        <Link
          href="/calculators/dots"
          className="mt-3 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
              Strength tool
            </p>
            <p className="text-sm font-black uppercase tracking-wide text-white">
              DOTS Score Calculator
            </p>
            <p className="text-xs text-lab-muted leading-snug mt-1">
              Score your squat, bench and deadlift total against your bodyweight — the modern Wilks.
            </p>
          </div>
          <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What is a one-rep max?</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Your one-rep max, or 1RM, is the heaviest weight you can move for a single clean rep on a
              given lift. It&apos;s the reference point strength programmes are built on: once you know it,
              you can set every working weight as a percentage of it rather than guessing. Testing a true
              max is taxing and carries risk, so most lifters estimate it from a hard set of a few reps.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">How the estimate works</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              We run your set through the Epley, Brzycki and Lombardi equations and average the result.
              Each formula was fitted to slightly different data and tends to over- or under-shoot at the
              edges, so the mean is steadier than any single one. The catch is universal: accuracy fades
              as reps rise. At five reps or fewer the number is tight; beyond ten to twelve it drifts, so
              we cap the input there.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Training off your percentages</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The real payoff is the load table. Heavy strength work generally sits at 85% or more of
              your max for low reps; hypertrophy work lives around 70–80% for moderate reps. Plugging your
              estimated max into those percentages gives you concrete weights to load on the bar, session
              after session, instead of chasing a feeling.
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
            Training drives strength — but creatine and a solid pre-workout are the two supplements with
            real evidence behind them. Every product we track is scored 0–100 on how closely its doses
            match that evidence.
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
            Informational only — not medical or coaching advice. Warm up, use safety pins or a spotter
            near your max, and stop if a lift feels unsafe. Buy links are affiliate links; we may earn a
            commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
