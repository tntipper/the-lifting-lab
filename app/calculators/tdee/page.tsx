import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import TdeeCalculator from './TdeeCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/tdee`

export const metadata: Metadata = {
  title: 'TDEE & Macro Calculator — Maintenance Calories, Cut or Bulk | The Lifting Lab',
  description:
    'Free TDEE and macro calculator. Work out your maintenance calories with the Mifflin-St Jeor equation, then get your protein, carb and fat targets to lose fat, maintain or lean bulk.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'TDEE & Macro Calculator — The Lifting Lab',
    description:
      'Find your maintenance calories, then get your protein, carb and fat targets for fat loss, maintenance or a lean bulk. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'TDEE & Macro Calculator — The Lifting Lab',
    description:
      'Maintenance calories plus your protein, carb and fat targets for any goal. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'What is TDEE?',
    a: 'TDEE stands for Total Daily Energy Expenditure — the total number of calories you burn in a day, including everything from breathing to training. It is your maintenance level: eat that many calories and your weight holds steady. We work it out by estimating your resting burn (BMR) and multiplying by an activity factor.',
  },
  {
    q: 'How is TDEE calculated?',
    a: 'We use the Mifflin-St Jeor equation, the most accurate BMR formula for the general population, from your sex, age, height and weight. That gives your basal metabolic rate — the calories you would burn at complete rest. We then multiply by an activity factor from 1.2 (sedentary) to 1.9 (athlete) to reach your full daily burn.',
  },
  {
    q: 'How many calories should I eat to lose fat?',
    a: 'For steady fat loss we set calories at roughly 20 percent below your maintenance (TDEE). That is aggressive enough to see progress but gentle enough to hold onto muscle, especially with protein kept high. For a lean bulk we add about 10 percent instead, and for maintenance you simply eat at your TDEE.',
  },
  {
    q: 'How do you set the macros?',
    a: 'Protein is set per kilogram of bodyweight — higher on a cut (around 2.2 g/kg) to protect lean mass, a little lower on maintenance or a bulk. Fat holds a hormonal-health floor of about 0.9 g/kg, and carbohydrate fills the remaining calories to fuel your training. It is a proven, simple split, not a rigid rule.',
  },
  {
    q: 'Is this medical or nutrition advice?',
    a: 'No. These figures are general, evidence-based starting points for healthy adults, not personalised diet plans or medical advice. Your real intake will need adjusting based on how your weight actually moves over two to three weeks. If you are pregnant, have a health condition, or take medication, speak to a qualified clinician or dietitian.',
  },
]

export default function TdeePage() {
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
      { name: 'TDEE & Macros', item: URL },
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
            <li aria-current="page" className="text-white/80">TDEE &amp; Macros</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          TDEE &amp; Macro <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Find your maintenance calories with the Mifflin-St Jeor equation, then get exact protein,
          carb and fat targets for whatever you&apos;re chasing — fat loss, maintenance or a lean bulk.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. Enter your stats, pick your activity and goal, and get the numbers
          your whole diet is built on.
        </p>

        <TdeeCalculator />

        {/* sibling tool — dedicated 1RM page */}
        <Link
          href="/calculators/1rm"
          className="mt-4 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
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

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What TDEE actually is</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Your Total Daily Energy Expenditure is every calorie you burn in a day — resting
              metabolism, digestion, daily movement and training combined. It is your maintenance
              line: eat at it and your weight sits still, eat below it and you lose, above it and you
              gain. Almost every diet decision comes back to knowing this one number.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">How the numbers are worked out</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              We estimate your basal metabolic rate with the Mifflin-St Jeor equation — the formula
              validated as most accurate for the general population — then multiply by an activity
              factor from 1.2 for a desk-bound week up to 1.9 for twice-daily training. That gives your
              TDEE. From there we shift calories down about 20% for fat loss, hold them for
              maintenance, or add about 10% for a controlled lean bulk.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Turning calories into macros</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Calories decide whether you gain or lose; macros decide what that weight is made of.
              Protein comes first, set per kilogram of bodyweight and pushed higher on a cut to defend
              muscle. Fat holds a floor of roughly 0.9g/kg for hormone health, and carbohydrate takes
              whatever calories are left to power your sessions. Adjust from there based on how the
              scale and the mirror actually move over a few weeks.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Now hit those macros</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Whole food should do most of the work, but a whey shake is the easiest way to close a
            protein gap. Every product we track is scored 0–100 on how closely its doses match the
            evidence — or let the wizard build your whole stack.
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
            Informational only — not medical or nutrition advice. Figures are general starting points
            for healthy adults and will need adjusting to how your weight actually moves. Buy links are
            affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
