import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CitrullineCalculator from './CitrullineCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/citrulline`

export const metadata: Metadata = {
  title: 'Citrulline Dosage Calculator — L-Citrulline vs Malate | The Lifting Lab',
  description:
    'Free citrulline dosage calculator. Pick your form — L-citrulline, citrulline malate 2:1 or 1:1 — and get the exact powder to weigh out for an effective dose, plus whether your pre-workout underdoses it.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Citrulline Dosage Calculator — L-Citrulline vs Malate | The Lifting Lab',
    description:
      'How much of your citrulline to take for a real dose — and how much actual L-citrulline your pre-workout gives you. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Citrulline Dosage Calculator — L-Citrulline vs Malate | The Lifting Lab',
    description:
      'Your effective citrulline dose by form, plus a label reality-check for your pre-workout. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much citrulline should I take pre-workout?',
    a: 'The effective dose is around 6 to 8 grams of actual L-citrulline, taken roughly 45 to 60 minutes before training. If you use citrulline malate instead, you need more of the powder to hit that, because only part of it is citrulline: about 9g of a 2:1 malate or 12g of a 1:1 malate delivers 6g of real L-citrulline.',
  },
  {
    q: 'What is the difference between L-citrulline and citrulline malate?',
    a: 'L-citrulline is the pure amino acid. Citrulline malate bonds it to malic acid, so a 2:1 malate is only about 67% citrulline and a 1:1 malate just 50%. Both work, but a label figure for malate overstates how much active citrulline you are actually getting — 8g of 2:1 malate is only about 5.3g of L-citrulline.',
  },
  {
    q: 'Should I take citrulline every day like creatine?',
    a: 'No. Unlike creatine and beta-alanine, citrulline does not need to build up in the muscle over weeks. Its blood-flow and performance effect is acute, so you dose it per session, before the workouts where you want it — much like caffeine. Taking it on rest days does little.',
  },
  {
    q: 'Is the citrulline in my pre-workout enough?',
    a: 'Often not. Many pre-workouts list citrulline malate at 3 to 6g, which after the malic acid is only about 2 to 4g of real L-citrulline — below the effective dose — and prop blends hide the amount entirely. A cheap standalone tub is usually the reliable, better-value way to reach a true 6 to 8g. This tool is not medical advice.',
  },
  {
    q: 'Does citrulline actually work?',
    a: 'It is one of the better-supported pump and endurance ingredients. It raises nitric oxide and blood flow, and studies at a proper dose show more reps to failure and less muscle soreness. It is not a stimulant — you will not feel a buzz — and the benefit is modest but real when it is dosed correctly.',
  },
]

export default function CitrullinePage() {
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
      { name: 'Citrulline Dosage', item: URL },
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
            <li aria-current="page" className="text-white/80">Citrulline Dosage</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Citrulline Dosage <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Pick your form and we&apos;ll show the exact powder to weigh out for an effective dose — plus a
          reality-check on how much real L-citrulline your pre-workout actually gives you.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          The catch nobody explains: citrulline malate is only part citrulline. A 2:1 malate is ~67%
          active, a 1:1 malate just 50%, so a big label number can hide a small real dose. This tool
          converts your form into a true 6 to 8g of L-citrulline — the range the evidence backs.
        </p>

        <CitrullineCalculator />

        {/* sibling tools — the evidence-based pre-workout ergogenics */}
        <div className="mt-4 grid gap-3">
          <Link
            href="/calculators/caffeine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Supplement tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Caffeine Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The other acute pre-workout active — your effective dose and a half-life sleep cut-off.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/beta-alanine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Supplement tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Beta-Alanine Dosage Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The daily-saturation pre-workout ingredient — your dose for your bodyweight and days per tub.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What citrulline actually does</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              L-citrulline is an amino acid your body converts into arginine, which raises nitric oxide and
              widens your blood vessels. More blood flow means a bigger pump, more oxygen and nutrients to
              working muscle, and — at a proper dose — a few extra reps before failure plus less soreness
              the next day. It is not a stimulant, so there is no buzz; it sits alongside caffeine and
              beta-alanine as one of the few pre-workout ingredients with genuine evidence behind it.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why the form matters so much</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is where labels mislead. Pure L-citrulline is 100% active. Citrulline malate bonds it to
              malic acid in a fixed ratio — 2:1 malate is about two-thirds citrulline, 1:1 malate only half.
              So &quot;8g of citrulline malate 2:1&quot; is really about 5.3g of L-citrulline, and a 1:1 blend is
              worse. Neither is a scam, but you have to weigh out more of the powder to land on an effective
              dose, and a brand quoting the malate weight will always look stronger than it is.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Dose it like caffeine, not creatine</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Citrulline&apos;s effect is acute. It does not need to accumulate in the muscle over weeks the way
              creatine and beta-alanine do, so there is no loading phase and no point dosing it on rest days.
              Take a full 6 to 8g of actual L-citrulline about 45 to 60 minutes before the sessions where you
              want the pump and the extra volume, and skip it the rest of the time. Consistency does not
              beat a single correct pre-workout dose here.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Get a properly dosed product</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Most pre-workouts underdose citrulline or bury it in a proprietary blend, so you never really
            know what you are getting. A standalone tub, or a genuinely well-dosed pre-workout, is how you
            actually hit 6 to 8g. Every product we track is scored 0–100 on exactly that kind of honest dosing.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best/pre-workout"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best pre-workout 2026 →
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
