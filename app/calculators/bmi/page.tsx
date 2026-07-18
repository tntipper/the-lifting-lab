import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import BmiCalculator from './BmiCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/bmi`

export const metadata: Metadata = {
  title: 'BMI Calculator — And Why It Lies to Lifters | The Lifting Lab',
  description:
    'Free BMI calculator (metric and imperial). Get your Body Mass Index and category in seconds — plus an honest read on why BMI misjudges muscular lifters, and the body fat and FFMI tools that do it properly.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'BMI Calculator — And Why It Lies to Lifters | The Lifting Lab',
    description:
      'Get your BMI in seconds, metric or imperial — then see why it mislabels muscular lifters and which numbers to trust instead.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BMI Calculator — And Why It Lies to Lifters | The Lifting Lab',
    description:
      'Your BMI in seconds, plus the honest reason lifters should not trust it. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How is BMI calculated?',
    a: 'BMI is your weight in kilograms divided by your height in metres squared. So an 82kg person at 1.78m has a BMI of 82 / (1.78 x 1.78), which is about 25.9. If you work in pounds and feet, we convert for you — the maths and the resulting number are exactly the same on either unit system.',
  },
  {
    q: 'What is a healthy BMI?',
    a: 'For the general adult population the World Health Organisation bands are: under 18.5 underweight, 18.5 to 24.9 normal, 25 to 29.9 overweight, and 30 or above obese. These are population averages built from people who mostly do not lift, so treat them as a rough screen rather than a verdict on your individual health.',
  },
  {
    q: 'Why is BMI inaccurate for muscular people?',
    a: 'BMI only knows your total weight and your height. It cannot tell whether that weight is muscle or fat, so a lean, heavily trained lifter and a soft, sedentary person of the same height and weight get the identical BMI. Because muscle is dense, most serious lifters read as overweight or even obese on BMI while carrying perfectly healthy body fat. That is a limitation of the formula, not a problem with your physique.',
  },
  {
    q: 'What should lifters use instead of BMI?',
    a: 'Body fat percentage and FFMI (Fat-Free Mass Index) are far better. Body fat percentage tells you how lean you actually are, and FFMI scores how much muscle you carry for your height. Together they separate the two things BMI blurs into one. Both have free calculators on this site, and a tape measure is enough to get started.',
  },
  {
    q: 'Is BMI completely useless then?',
    a: 'No. As a quick, zero-equipment population screen it still has a place, especially at the extremes and for people who do not train. It is simply the wrong tool for judging a muscular physique. Use it as a starting point, then reach for body fat percentage or FFMI for anything that matters to a lifter.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. BMI and the body-composition tools here are general, evidence-based estimates for healthy adults, not clinical assessment or medical advice. If you have a health condition or concerns about your weight, speak to a qualified clinician.',
  },
]

export default function BmiPage() {
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
      { name: 'BMI', item: URL },
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
            <li aria-current="page" className="text-white/80">BMI</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          BMI <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter your height and weight for an instant Body Mass Index and category — in metric or
          imperial. Then read the part most BMI calculators leave out: why the number misjudges anyone
          who trains.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. BMI is a fast population screen, but it cannot tell muscle from fat —
          so we point you straight to the body fat and FFMI tools that actually measure a physique.
        </p>

        <BmiCalculator />

        {/* sibling tools — the honest upgrades from BMI */}
        <div className="mt-4 grid gap-3">
          <Link
            href="/calculators/body-fat"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Body composition tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Body Fat Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                What BMI cannot see: estimate how lean you actually are from a tape measure.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/ffmi"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Body composition tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                FFMI Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The muscle-aware version of BMI — scores your lean mass for your height.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What BMI actually is</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Body Mass Index is a nineteenth-century formula: your weight divided by your height
              squared. It was built to describe populations, not individuals, and it does that job
              cheaply — no equipment, one quick sum. As a rough flag at the extremes it still works.
              The trouble starts the moment you use it to judge one person, because a single number
              from weight and height alone cannot describe a body.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why lifters read &quot;overweight&quot;</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Muscle is denser than fat, so a trained lifter carries more weight for their height than
              the sedentary average the BMI bands were calibrated on. The result is that most people
              with a serious training age land in the overweight band, and plenty of lean,
              competition-ready physiques read as obese. The formula is not wrong about your weight —
              it is simply blind to what that weight is made of. That single blind spot is why BMI and
              a photo of the same person often tell completely different stories.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The numbers to trust instead</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              If you train, two figures beat BMI outright. Body fat percentage tells you how lean you
              are, which is what &quot;overweight&quot; is really trying to get at. FFMI tells you how
              much muscle you carry for your height, which is what makes a lifter heavy in the first
              place. Measure both and BMI becomes a footnote: you will know whether your weight is fat
              to lose or muscle to be proud of, and no population average can argue with that.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Past the number — build the body</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            BMI does not move a physique; training, protein and consistency do. The two supplements
            with real evidence behind them — whey to hit your protein target and creatine to support
            the work — are each scored 0–100 on how closely they match that evidence.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best/whey"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best whey 2026 →
            </Link>
            <Link
              href="/calculators"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              More calculators
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. BMI bands are population averages and do not
            account for muscle mass. Buy links are affiliate links; we may earn a commission at no
            extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
