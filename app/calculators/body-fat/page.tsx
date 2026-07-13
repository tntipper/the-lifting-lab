import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import BodyFatCalculator from './BodyFatCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/body-fat`

export const metadata: Metadata = {
  title: 'Body Fat Calculator (US Navy Method) — Estimate Your Body Fat % | The Lifting Lab',
  description:
    'Free body fat percentage calculator using the US Navy tape-measure method. Enter your height, neck and waist to estimate your body fat, category, lean mass and fat mass. No calipers, no scales needed.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Body Fat Calculator (US Navy Method) — The Lifting Lab',
    description:
      'Estimate your body fat percentage from a tape measure, then see your category, lean mass and fat mass. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Body Fat Calculator (US Navy Method) — The Lifting Lab',
    description:
      'Estimate your body fat percentage from a tape measure, plus your lean and fat mass. Free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How does the US Navy body fat calculator work?',
    a: 'It estimates body fat from a few tape measurements rather than skinfold calipers or a scan. Men enter height, neck and waist; women add the hip. The formula, developed by the US Navy, uses the ratio between your waist and neck (and hip for women) relative to height, because fat tends to gather around the midsection. It is a well-validated field method that needs no special kit.',
  },
  {
    q: 'How accurate is it?',
    a: 'For most people it lands within about 3 to 4 percentage points of a DEXA scan, which is good for a free tape-measure tool. Accuracy depends entirely on consistent measuring: keep the tape snug but not tight, measure at the same spots each time, and track the trend over weeks rather than fixating on a single reading. It can read high for very muscular, thick-waisted lifters and low for very lean people.',
  },
  {
    q: 'What is a healthy body fat percentage?',
    a: 'For men, roughly 6 to 17 percent is the athletic-to-fitness range and 18 to 24 percent is average; 25 percent and above is classed as above average. For women the same bands sit about 8 points higher (14 to 24 percent fit, 25 to 31 percent average, 32 percent plus above average) because women carry more essential fat. Dropping below the essential floor is not a goal to chase — it can harm hormones and health.',
  },
  {
    q: 'How do I actually lower my body fat?',
    a: 'Body fat comes down in a calorie deficit held consistently over time, with enough protein and resistance training to keep the muscle you already have. Work out your maintenance calories, eat below them, and hit roughly 2 grams of protein per kg of bodyweight. No supplement burns fat in any meaningful way; the ones that help are the ones that make the deficit easier to sustain, like whey to hit protein.',
  },
  {
    q: 'Is this medical advice?',
    a: 'No. It is a general, evidence-based estimate for healthy adults, not a clinical body-composition measurement or medical advice. If you have a health condition or are making big changes to your diet or training, speak to a qualified clinician or dietitian.',
  },
]

export default function BodyFatPage() {
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
      { name: 'Body Fat', item: URL },
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
            <li aria-current="page" className="text-white/80">Body Fat</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Body Fat <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Estimate your body fat percentage with the US Navy tape-measure method — no calipers, no
          scan. Enter a few measurements and get your body fat, your category, and your lean and fat
          mass.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          No sign-up, no maths. It is the same field formula the military uses, and it only needs a
          tape measure.
        </p>

        <BodyFatCalculator />

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
              Know your body fat? Now set the calories and macros to change it — cut, maintain or bulk.
            </p>
          </div>
          <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
        </Link>

        {/* sibling tool — dedicated 1RM page */}
        <Link
          href="/calculators/1rm"
          className="mt-3 flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
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
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What is body fat percentage?</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Body fat percentage is the share of your total bodyweight that is fat, as opposed to
              muscle, bone, organs and water. It tells you far more than the scale or BMI alone: two
              people at the same weight can look and perform completely differently depending on how
              much of that weight is lean tissue. For anyone lifting, it is the number that actually
              tracks whether a cut or a bulk is going the right way.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">How to measure properly</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Use a flexible tape and measure relaxed, first thing in the morning if you can. Neck:
              just below the larynx, tape sloping slightly down at the front. Waist: at the navel for
              men, at the narrowest point for women. Hip (women): around the widest part of the
              glutes. Keep the tape snug against the skin but not digging in, and take each reading
              twice. Consistency between measurements matters more than any single number.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Reading your result</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The tool sorts you into a category and shows the full scale for your sex, so you can see
              how far you are from the range you want. Chasing the essential-fat floor is not the goal
              — very low body fat comes with real hormonal and health costs. Most lifters do best
              sitting in the athletic-to-fitness band, lean enough to look strong and stay healthy,
              with enough fuel to actually train hard.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Ready to change the number?</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Body composition changes in the kitchen: a steady calorie deficit and enough protein to
            hold your muscle. Set your calories with the TDEE tool, then use the products scored 0–100
            on the evidence to close your protein gap.
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
            Informational only — not medical advice. Body fat is an estimate from a field formula, not
            a clinical measurement. Buy links are affiliate links; we may earn a commission at no extra
            cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
