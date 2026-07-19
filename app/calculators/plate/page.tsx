import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import PlateCalculator from './PlateCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/plate`

export const metadata: Metadata = {
  title: 'Barbell Plate Calculator — What Plates To Load | The Lifting Lab',
  description:
    'Free barbell plate calculator. Enter your target weight and bar, and see exactly which plates to load on each side — kg or lb, with the standard competition plate colours. Instant, no maths.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Barbell Plate Calculator — What Plates To Load | The Lifting Lab',
    description:
      'Enter your target weight and bar, get the exact plates to slide on each side. kg or lb, colour-coded. Instant and free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Barbell Plate Calculator — What Plates To Load | The Lifting Lab',
    description:
      'Enter your target and bar, get the exact plates per side. kg or lb, colour-coded. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How do I know what plates to load for a weight?',
    a: 'Take your target weight, subtract the bar, then split the rest evenly between the two sides. This calculator does it for you: enter the total you want and your bar weight, and it shows the exact plates to slide on each side, largest first.',
  },
  {
    q: 'How much does an Olympic barbell weigh?',
    a: 'A standard men’s Olympic barbell is 20kg (about 45lb). The women’s Olympic bar is 15kg (about 35lb), and many gyms also have 10 to 15kg training bars. Always subtract the bar before you work out the plates, which is why the tool asks you to pick your bar.',
  },
  {
    q: 'Why are the plate numbers different colours?',
    a: 'Competition plates follow a colour code so lifters can read a loaded bar at a glance: in kilograms, 25 is red, 20 blue, 15 yellow, 10 green and 5 white. The pound plates here use the common US colour convention. Home and commercial gym plates are often all black, but the weights load the same way.',
  },
  {
    q: 'What if the exact weight cannot be loaded?',
    a: 'If your target does not divide evenly into the plates in the set, the tool loads as close as it can and tells you how far short each side is and the nearest weight you can actually make. Add micro or fractional plates if you need to hit an exact number for a lift.',
  },
  {
    q: 'Which supplements actually help me add weight to the bar?',
    a: 'For strength, creatine monohydrate at 3 to 5 grams a day is the most evidence-backed supplement there is, and a caffeinated pre-workout can lift a hard session. Everything else is a distant second to progressive overload, sleep and enough protein. This tool is a training aid, not medical advice.',
  },
]

export default function PlatePage() {
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
      { name: 'Barbell Plates', item: URL },
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
            <li aria-current="page" className="text-white/80">Barbell Plates</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Barbell Plate <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter the weight you want on the bar and your bar weight, and we&apos;ll show exactly which
          plates to slide on each side — colour-coded, largest first, no mental maths mid-session.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Works in kilograms or pounds, with the standard competition plate colours so a loaded bar is
          readable at a glance. If a weight cannot be made exactly, it shows the nearest you can load.
        </p>

        <PlateCalculator />

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
                Estimate your 1RM from any set, then get your working loads at every percentage.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/dots"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
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
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The plate maths, done for you</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Loading a bar is simple in theory and easy to fumble under fatigue: subtract the bar,
              halve what is left, and load that per side. A 100kg squat on a 20kg bar is 40kg a side —
              a 20 and a 15 and a 5, or two 20s. This tool removes the guesswork so you rack the right
              weight first time, every set, without counting plates while your heart rate is still up.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Know your bar</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The single most common loading mistake is forgetting the bar itself. A men&apos;s Olympic
              bar is 20kg, a women&apos;s is 15kg, and lighter training or technique bars run 10 to 15kg.
              A fixed EZ or Smith machine bar can be almost anything. Pick the right bar here first,
              because every plate figure below it depends on getting that starting number right.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Reading the colours</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Competition plates are colour-coded so you can read a loaded bar from across the room:
              25kg red, 20kg blue, 15kg yellow, 10kg green, 5kg white, then the smaller change plates.
              Most home and commercial gyms run plain black plates, but the weights and the loading
              order are identical — the colours here just make the on-screen plan quicker to scan.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Adding weight to the bar?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Training does the work — but creatine and a solid pre-workout are the two supplements with
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
            Informational only — not medical or coaching advice. Plate colours follow the common
            competition convention; check your own gym&apos;s plates. Buy links are affiliate links; we
            may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
