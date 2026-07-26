import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import RpeCalculator from './RpeCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/rpe`

export const metadata: Metadata = {
  title: 'RPE Calculator — RPE to Percentage & Load Chart | The Lifting Lab',
  description:
    'Free RPE calculator. Rate any set by reps and RPE to estimate your 1-rep max, then get the exact load to hit any reps at any RPE. Includes the RPE / RIR to percentage chart.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'RPE Calculator — RPE to Percentage & Load Chart | The Lifting Lab',
    description:
      'Rate a set by reps and RPE, estimate your 1RM, and get the exact load for your next set. With the full RPE / RIR chart.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'RPE Calculator — RPE to Percentage & Load Chart | The Lifting Lab',
    description:
      'Rate a set by reps and RPE, estimate your 1RM, and get the exact load for your next set. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'What is RPE in weightlifting?',
    a: 'RPE stands for Rate of Perceived Exertion, a 1 to 10 scale for how hard a set felt. In lifting it maps to reps in reserve: RPE 10 means you had nothing left, RPE 9 means one more rep was possible, RPE 8 means two, and so on. It lets you auto-regulate — training to a target effort rather than a fixed percentage that ignores how you feel that day.',
  },
  {
    q: 'How does RPE convert to a percentage of 1RM?',
    a: 'A set of a given reps at a given RPE equals an all-out set of a few more reps, because reps in reserve = 10 minus RPE. For example 5 reps at RPE 8 (two in reserve) is about a 7-rep max, which sits near 81% of your 1RM. This calculator uses the standard Reactive Training Systems chart to do that conversion both ways.',
  },
  {
    q: 'What is the difference between RPE and RIR?',
    a: 'They are two sides of the same coin. RIR (reps in reserve) counts the reps you could still have done: RPE 10 is 0 RIR, RPE 9 is 1 RIR, RPE 8 is 2 RIR. Many lifters find RIR easier to judge in the moment, then read it as an RPE. This tool shows both so you can use whichever you prefer.',
  },
  {
    q: 'How accurate is an RPE-based 1RM estimate?',
    a: 'It is an estimate, and it is only as accurate as your RPE call. Rating is a skill: newer lifters tend to under-rate hard sets (calling a true RPE 9 an RPE 7), which inflates the number. Use it as a training guide for load selection, not a competition max, and it becomes more reliable as you get honest about how close to failure you really are.',
  },
  {
    q: 'Which supplements actually help me train harder?',
    a: 'For strength and hard sets, creatine monohydrate at 3 to 5 grams a day is the most evidence-backed supplement there is, and a caffeinated pre-workout can lift a heavy session. Neither replaces good sleep, enough protein and sensible RPE management. This tool is a training aid, not medical advice.',
  },
]

export default function RpePage() {
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
      { name: 'RPE Calculator', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  // RPE / RIR reference — mirrors the copy so the chart is real crawlable content.
  const scale = [
    { rpe: '10', rir: '0', note: 'Absolute max — no more reps possible' },
    { rpe: '9.5', rir: '0–1', note: 'Maybe one more, maybe not' },
    { rpe: '9', rir: '1', note: 'One clean rep left in the tank' },
    { rpe: '8.5', rir: '1–2', note: 'One for sure, possibly two' },
    { rpe: '8', rir: '2', note: 'Two reps left — a hard working set' },
    { rpe: '7', rir: '3', note: 'Three left — a solid, controllable set' },
    { rpe: '6', rir: '4', note: 'Four or more left — speed / warm-up work' },
  ]

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
            <li aria-current="page" className="text-white/80">RPE Calculator</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          RPE <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Rate a working set by its reps and RPE, and we&apos;ll estimate your 1-rep max — then tell you
          exactly what to load for any reps at any RPE next time.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          RPE (Rate of Perceived Exertion) turns &quot;how hard did that feel&quot; into a number you can
          program with. It uses the standard reps-in-reserve chart, so you train to the right effort
          instead of a fixed percentage that ignores how you feel on the day.
        </p>

        <RpeCalculator />

        {/* RPE / RIR reference chart — real crawlable content */}
        <section className="mt-10">
          <h2 className="text-lg font-black uppercase tracking-wide mb-4">
            RPE / RIR <span className="text-lab-lime">chart</span>
          </h2>
          <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
            <div className="grid grid-cols-[auto_auto_1fr] text-xs">
              <div className="px-4 py-2.5 font-black uppercase tracking-widest text-lab-muted border-b border-lab-border">RPE</div>
              <div className="px-4 py-2.5 font-black uppercase tracking-widest text-lab-muted border-b border-lab-border">RIR</div>
              <div className="px-4 py-2.5 font-black uppercase tracking-widest text-lab-muted border-b border-lab-border">What it feels like</div>
              {scale.map((row) => (
                <div key={row.rpe} className="contents">
                  <div className="px-4 py-2.5 font-black text-lab-lime tabular-nums border-b border-lab-border/60">{row.rpe}</div>
                  <div className="px-4 py-2.5 text-white/90 tabular-nums border-b border-lab-border/60">{row.rir}</div>
                  <div className="px-4 py-2.5 text-lab-muted border-b border-lab-border/60">{row.note}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* sibling tools — dedicated calculator pages */}
        <div className="mt-8 grid gap-3">
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
                Estimate your 1RM from an all-out set, then get your working loads at every percentage.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/plate"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Strength tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Barbell Plate Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Enter the weight your RPE work calls for — see the exact plates to load on each side.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why train with RPE</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Fixed percentages assume every day is the same. RPE does not. Rating a set on the 1 to 10
              scale lets you push when you feel strong and back off when you do not, while still hitting
              the intended effort. Over a training block that auto-regulation keeps hard sets hard and
              easy sets easy — the single biggest driver of progress after showing up consistently.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">RPE and reps in reserve</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The simplest way to rate a set is to ask how many more reps you could have done. That is
              your reps in reserve, and RPE is just ten minus it: two reps left is an RPE 8, one left is
              an RPE 9, nothing left is an RPE 10. This tool works in both, because a set of five at
              RPE 8 is the same effort as a seven-rep max — which is exactly how it converts to a
              percentage of your one-rep max.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Get honest with your rating</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              An RPE estimate is only as good as your RPE call. Most lifters, especially early on,
              under-rate hard sets and call a true RPE 9 a 7, which flatters the numbers. Film a set now
              and then and count the grind: if the bar slowed to a crawl, that was not an RPE 7. Treat
              the estimated max here as a training guide for load selection, not a competition number.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Training near your limit?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Hard RPE work is where creatine and a solid pre-workout earn their place — the two
            supplements with real evidence behind them. Every product we track is scored 0–100 on how
            closely its doses match that evidence.
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
            Informational only — not medical or coaching advice. RPE-to-percentage figures follow the
            standard reps-in-reserve chart and are estimates. Buy links are affiliate links; we may earn
            a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
