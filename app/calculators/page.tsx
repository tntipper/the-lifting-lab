import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import Calculators from './Calculators'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators`

export const metadata: Metadata = {
  title: 'Supplement Dosage Calculators — Protein, Creatine & Caffeine | The Lifting Lab',
  description:
    'Free UK supplement calculators. Work out your daily protein target, your creatine dose, and a safe, effective caffeine range for your bodyweight — backed by the evidence, not the label.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Dosage Calculators — The Lifting Lab',
    description:
      'Daily protein target, creatine dose and safe caffeine range for your bodyweight. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Dosage Calculators — The Lifting Lab',
    description:
      'Daily protein target, creatine dose and safe caffeine range for your bodyweight. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much protein should I eat per day?',
    a: 'For most lifters, roughly 1.6 to 2.2 grams of protein per kilogram of bodyweight daily supports muscle. On a fat-loss phase it is pushed higher (around 2.0 to 2.4 g/kg) to protect lean mass. Our protein calculator turns that into a gram target for your weight and goal.',
  },
  {
    q: 'How much creatine should I take?',
    a: '3 to 5 grams of creatine monohydrate every day is the evidence-based maintenance dose, and it does not change with bodyweight. An optional loading phase of 20g a day (4 x 5g) for 5 to 7 days saturates your muscles faster, but is not required.',
  },
  {
    q: 'How much caffeine is safe before a workout?',
    a: 'The studied pre-workout range is about 3 to 6mg of caffeine per kilogram of bodyweight. We treat 400mg in a single serving as the ceiling, and EFSA puts the safe daily limit for healthy adults at 400mg from all sources. If you train in the evening, a stim-free option protects your sleep.',
  },
  {
    q: 'Are these calculators medical advice?',
    a: 'No. They are general, evidence-based starting points for healthy adults, not personalised medical or clinical advice. If you are pregnant, have a health condition, or take medication, speak to a qualified clinician before changing your supplement intake.',
  },
]

export default function CalculatorsPage() {
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
      { name: 'Calculators', item: URL },
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
            <li aria-current="page" className="text-white/80">Calculators</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Calculators</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Three quick, evidence-based tools to cut through the label noise: your daily protein
          target, the right creatine dose, and a safe, effective caffeine range for your bodyweight.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. Enter your weight, pick your goal, and each tool points you to the
          right products and the buyer&apos;s guide behind the numbers.
        </p>

        <Calculators />

        {/* sibling tools — dedicated calculator pages */}
        <div className="mt-4 grid gap-3">
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
                Estimate your body fat % from a tape measure — plus your category, lean and fat mass.
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
                Score your muscle mass for your height and see where you sit against the natural limit.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Protein target</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Total daily protein is what drives muscle growth and recovery, far more than the timing
              of any single shake. Most lifters do well on 1.6 to 2.2g per kg of bodyweight, climbing
              toward 2.4g/kg on a cut to hold onto lean mass. Whole food should do most of the work;
              a whey shake is simply the easiest way to close the last 25 to 50g gap.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Creatine dose</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Creatine is the rare supplement where the dose is flat: 3 to 5g of monohydrate a day,
              every day, regardless of how big you are. A loading phase only changes how fast your
              stores fill, not the end result. Because the dose is small and constant, the only thing
              that really separates products is purity and price per gram.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Caffeine range</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Caffeine is the one pre-workout ingredient that reliably works, at roughly 3 to 6mg per
              kg of bodyweight. More is not better: past 400mg in a serving the downsides start to win,
              which is exactly why our scoring penalises over-caffeinated pre-workouts. Keep your total
              from all sources under 400mg a day, and switch to stim-free if you train late.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Know your numbers?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Now find the products that hit them. Every supplement we track is scored 0–100 on how
            closely its doses match the evidence — or let the wizard build your whole stack.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Build my stack →
            </Link>
            <Link
              href="/products"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse all products
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Figures are general starting points for healthy
            adults. Buy links are affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
