import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ProteinCalculator from './ProteinCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/protein`

export const metadata: Metadata = {
  title: 'Protein Calculator — How Much Protein To Build Muscle | The Lifting Lab',
  description:
    'Free protein intake calculator. Enter your bodyweight and goal to get your daily protein target in grams, your per-meal split, and how much whey it takes to hit it — backed by the evidence.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Protein Calculator — How Much Protein Per Day | The Lifting Lab',
    description:
      'Work out your daily protein target for building muscle or losing fat. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Protein Calculator — How Much Protein Per Day | The Lifting Lab',
    description:
      'Your daily protein target for building muscle or losing fat, from your bodyweight and goal. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much protein should I eat per day?',
    a: 'For most people training to build or keep muscle, roughly 1.6 to 2.2 grams of protein per kilogram of bodyweight daily is the evidence-based range. On a fat-loss phase it is pushed a little higher, around 1.8 to 2.4 g/kg, to protect lean mass while you eat in a deficit. A lightly active adult with no physique goal needs less, closer to 0.8 to 1.0 g/kg. Enter your weight above and the calculator turns that into a gram target.',
  },
  {
    q: 'How much protein to build muscle?',
    a: 'Muscle growth is well supported by about 1.6 to 2.2 grams per kilogram of bodyweight per day, combined with progressive resistance training and enough total calories. Eating far beyond that range does not build extra muscle; the surplus is simply used for energy. Consistency across the week matters more than any single high-protein day.',
  },
  {
    q: 'Should I use bodyweight or lean body mass?',
    a: 'Total bodyweight works well for most people and is what this calculator uses. If you are carrying a lot of excess fat, basing the target on lean body mass (or a goal bodyweight) avoids over-shooting the number, since fat tissue does not need feeding with protein. For lean and average builds the two approaches land in a similar place.',
  },
  {
    q: 'How much protein can I absorb in one meal?',
    a: 'Your body absorbs almost all the protein you eat; the real question is how much drives muscle building per meal. Around 0.4 grams per kilogram of bodyweight per sitting, roughly 25 to 40 grams for most people, maximises that response. Spreading your daily total across three to five meals of that size is more effective than loading it all into one.',
  },
  {
    q: 'Do I need a protein powder to hit my target?',
    a: 'No, whole foods can cover it, but a scoop of whey is the cheapest and easiest way to close the gap when real food falls short, especially around training or on busy days. One 30g scoop adds roughly 24 grams of high-quality protein. If you tolerate dairy, whey is the best-value option; if not, a plant blend works too.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. These are general, evidence-based starting points for healthy adults, not personalised medical or clinical advice. If you have kidney disease, are pregnant, or have another health condition, speak to a qualified clinician before making large changes to your protein intake.',
  },
]

export default function ProteinCalculatorPage() {
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
      { name: 'Protein', item: URL },
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
            <li aria-current="page" className="text-white/80">Protein</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Protein <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Work out exactly how much protein you need each day to build muscle, lose fat without
          losing muscle, or simply stay healthy — based on your bodyweight and goal.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. Enter your weight, pick your goal, and get your daily gram target, a
          sensible per-meal split, and how much whey it takes to hit the number.
        </p>

        <ProteinCalculator />

        {/* sibling tool — TDEE for the full macro picture */}
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
              Protein is one macro. Get your full calorie, carb and fat targets for any goal here.
            </p>
          </div>
          <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why protein per kilo, not a flat number</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              A 60kg runner and a 100kg powerlifter do not need the same protein, so a single
              &quot;eat 150g&quot; rule is useless. Scaling the target to your bodyweight is what the
              research actually does, which is why every serious guideline is written in grams per
              kilogram. Your goal then shifts the multiplier: building or dieting sits at the high end
              to build or protect muscle, while general health sits lower.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Spread it across the day</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Total daily protein is what matters most, but how you split it still helps. Landing
              roughly 0.4 grams per kilogram in each of three to five meals maximises the
              muscle-building signal per sitting and is easier to digest than one giant serving. That
              is the per-meal figure the calculator shows alongside your daily total.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where whey fits</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Whole foods should do the heavy lifting, but most people fall short by dinner without
              realising it. A whey shake is the cheapest, fastest way to add 20 to 25 grams of
              complete protein, which is why it is the one supplement almost every evidence-based
              coach recommends. On our whey rankings, value comes down to true cost per effective
              serving — not the sticker price on the tub.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Hit your number with the right whey</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Once you know your daily target, the easiest way to close the gap is a scoop or two of
            whey. We score every whey protein 0–100 on the evidence and rank them by true cost per
            effective serving, so you pay for protein, not marketing.
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
            Informational only — not medical advice. Protein targets are general, evidence-based
            starting points for healthy adults. Buy links are affiliate links; we may earn a
            commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
