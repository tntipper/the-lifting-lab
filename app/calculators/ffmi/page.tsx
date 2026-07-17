import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import FfmiCalculator from './FfmiCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/ffmi`

export const metadata: Metadata = {
  title: 'FFMI Calculator — Fat-Free Mass Index & Your Natural Muscle Limit | The Lifting Lab',
  description:
    'Free FFMI calculator. Enter your height, weight and body fat to get your Fat-Free Mass Index, the height-normalised score, and where you sit against the documented natural muscle limit.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'FFMI Calculator — Fat-Free Mass Index | The Lifting Lab',
    description:
      'Work out your Fat-Free Mass Index and see how your muscle mass compares to the natural limit. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'FFMI Calculator — Fat-Free Mass Index | The Lifting Lab',
    description:
      'Your Fat-Free Mass Index and how it compares to the natural muscle limit. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'What is FFMI?',
    a: 'FFMI stands for Fat-Free Mass Index. It is your fat-free (lean) mass divided by your height squared, in the same style as BMI but counting only lean tissue rather than total weight. It is a better muscularity gauge than BMI or the scale because it strips out body fat and adjusts for how tall you are, so a lean 90kg lifter and a soft 90kg beginner get very different scores.',
  },
  {
    q: 'How is FFMI calculated?',
    a: 'First your fat-free mass is your bodyweight times (1 minus your body fat percentage). That lean mass in kilograms is then divided by your height in metres squared to give raw FFMI. We also show the normalised FFMI, which adjusts the figure to a 1.8 metre reference height so taller and shorter lifters can be compared on the same scale.',
  },
  {
    q: 'What is a good FFMI?',
    a: 'For men, roughly 18 to 20 is average, 20 to 22 is above average, and 22 to 25 is the well-muscled athletic range most dedicated natural lifters top out in. For women the whole scale sits lower, with about 15 to 18 covering average to athletic. Higher is more muscular for your frame, but the number depends on an honest body fat estimate.',
  },
  {
    q: 'Can FFMI tell if someone is natural?',
    a: 'Not on its own. Research on drug-free bodybuilders found FFMI rarely exceeded about 25 for men, which is why a value well above that is often treated as a red flag for anabolic assistance. But it is a population correlate, not a drug test. Exceptional genetics, a very long training age, an inaccurate body fat reading, or being unusually short can all push a genuine natural above the line.',
  },
  {
    q: 'How do I raise my FFMI?',
    a: 'The same way you build muscle anywhere: progressive resistance training, enough total protein (around 1.6 to 2.2 grams per kilogram of bodyweight daily), a slight calorie surplus over time, and sleep. No supplement adds meaningful lean mass on its own; the ones worth using, like whey to hit protein and creatine to support training, simply make the work more productive.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. FFMI is a general, evidence-based estimate for healthy adults, not a clinical body-composition measurement or medical advice. If you have a health condition or are considering hormonal interventions, speak to a qualified clinician.',
  },
]

export default function FfmiPage() {
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
      { name: 'FFMI', item: URL },
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
            <li aria-current="page" className="text-white/80">FFMI</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          FFMI <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Work out your Fat-Free Mass Index — the muscularity score that strips out body fat and
          adjusts for height, then shows where you sit against the documented natural muscle limit.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. Enter your height, weight and body fat, and get your raw and
          height-normalised FFMI, your fat-free mass, and an honest read on the scale.
        </p>

        <FfmiCalculator />

        {/* sibling tool — body fat feeds this calculator */}
        <Link
          href="/calculators/body-fat"
          className="mt-4 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
              Body composition tool
            </p>
            <p className="text-sm font-black uppercase tracking-wide text-white">
              Body Fat Calculator
            </p>
            <p className="text-xs text-lab-muted leading-snug mt-1">
              FFMI needs your body fat %. Estimate it here first with a tape measure, then come back.
            </p>
          </div>
          <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        {/* sibling tool — TDEE for the surplus that grows FFMI */}
        <Link
          href="/calculators/tdee"
          className="mt-3 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
              Nutrition tool
            </p>
            <p className="text-sm font-black uppercase tracking-wide text-white">
              TDEE &amp; Macro Calculator
            </p>
            <p className="text-xs text-lab-muted leading-snug mt-1">
              Building lean mass takes a small surplus and enough protein. Set the numbers here.
            </p>
          </div>
          <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why FFMI beats BMI</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              BMI cannot tell muscle from fat, so it labels most serious lifters overweight. FFMI
              fixes that by counting only your fat-free mass — muscle, bone, organs and water — and
              dividing by your height squared. The result is a number that actually tracks how
              muscular you are for your frame, which is why coaches and researchers reach for it
              instead of the scale or BMI when judging physique development.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Raw vs normalised FFMI</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Raw FFMI slightly favours shorter lifters, because lean mass does not scale perfectly
              with height squared. The normalised figure adds a small height correction back to a 1.8
              metre reference, so a 165cm and a 190cm lifter can be compared fairly. When people quote
              FFMI numbers or the famous natural ceiling, they almost always mean the normalised
              value, which is the one shown as your headline result.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The natural limit — read honestly</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              A well-known study of drug-free bodybuilders found their FFMI clustered around 25 and
              rarely went higher, while steroid users reached well beyond it. That is where the idea
              of a natural ceiling near 25 for men comes from. Treat it as a soft statistical marker,
              not proof of anything: genetics, a decade of training, a low or mismeasured body fat
              reading, or simply being short can all lift a genuine natural above the line. The
              number is only as honest as the body fat percentage you feed it.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Want to move the number up?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            FFMI rises when you add lean mass, and that takes training, a small surplus and enough
            protein. Only two supplements genuinely help the process — whey to hit your protein
            target and creatine to support the training — and both are scored 0–100 on the evidence.
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
            Informational only — not medical advice. FFMI is an estimate from a field formula and
            depends on your body fat reading. Buy links are affiliate links; we may earn a commission
            at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
