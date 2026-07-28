import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CaffeineCalculator from './CaffeineCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/caffeine`

export const metadata: Metadata = {
  title: 'Caffeine Calculator — Pre-Workout Dose & Half-Life | The Lifting Lab',
  description:
    'Free caffeine calculator. Get your effective pre-workout dose for your bodyweight, then see how long caffeine lingers and the latest time to take it before bed so it does not wreck your sleep.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Caffeine Calculator — Pre-Workout Dose & Half-Life | The Lifting Lab',
    description:
      'Your effective caffeine dose for your bodyweight, plus a half-life sleep-cutoff clock. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Caffeine Calculator — Pre-Workout Dose & Half-Life | The Lifting Lab',
    description:
      'Your caffeine dose for your bodyweight, plus how long it lingers and when to stop before bed. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much caffeine should I take before a workout?',
    a: 'The studied performance range is about 3 to 6 milligrams of caffeine per kilogram of bodyweight, taken 30 to 60 minutes before training. For an 82kg lifter that is roughly 245 to 400mg. More is not better — past 400mg in a day the downsides tend to outweigh the extra benefit, which is exactly why our scoring penalises over-caffeinated pre-workouts.',
  },
  {
    q: 'What is the half-life of caffeine?',
    a: 'In healthy adults caffeine has a half-life of roughly 5 hours, meaning half the dose is still in your system 5 hours after you take it, a quarter after 10 hours. It is longer if you are pregnant, on certain medications, or a slow metaboliser, and shorter in heavy smokers. That slow clearance is why an afternoon pre-workout can still be keeping you up at midnight.',
  },
  {
    q: 'When should I stop drinking caffeine before bed?',
    a: 'A useful rule is to stop early enough that less than about 100mg is still circulating when you go to sleep. Because of the 5 hour half-life, a 200mg dose takes roughly 5 hours to fall to 100mg, and a 400mg dose takes about 10 hours. Enter your dose and bedtime above and the tool gives you the exact latest clock time to take it.',
  },
  {
    q: 'How much caffeine is safe per day?',
    a: 'EFSA puts the safe daily limit for healthy adults at 400mg from all sources, and single doses up to 200mg raise no safety concern. Pregnant women should stay under 200mg a day. These are general figures for healthy adults, not medical advice — if you have a heart condition, anxiety, high blood pressure or take medication, speak to a clinician.',
  },
  {
    q: 'Does caffeine tolerance mean I should keep increasing the dose?',
    a: 'No. Regular use blunts some of the alertness effect, but chasing it with ever-bigger doses just pushes you toward the side effects and wrecks your sleep, which harms training more than the caffeine helps. A better move is a short deload from stimulants every so often, or cycling stim-free pre-workout on lighter days, to reset sensitivity.',
  },
]

export default function CaffeinePage() {
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
      { name: 'Caffeine', item: URL },
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
            <li aria-current="page" className="text-white/80">Caffeine</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Caffeine <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter your bodyweight and we&apos;ll show your effective pre-workout caffeine dose — then, because
          caffeine hangs around for hours, the latest time you can take it before bed without wrecking your sleep.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Caffeine is the one pre-workout ingredient that reliably works, at 3 to 6mg per kg of bodyweight.
          But it has a ~5 hour half-life, so timing matters as much as the dose. This tool handles both.
        </p>

        <CaffeineCalculator />

        {/* sibling tools — dedicated calculator pages */}
        <div className="mt-4 grid gap-3">
          <Link
            href="/calculators/creatine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Supplement tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Creatine Dosage Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Your exact loading and maintenance dose for your bodyweight, plus days to full saturation.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/citrulline"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Supplement tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Citrulline Dosage Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The other big pre-workout active — how much of your form to take, and if your scoop underdoses it.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

          <Link
            href="/calculators/protein"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Nutrition tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Protein Calculator
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Get your daily protein target in grams for building muscle or losing fat, plus a per-meal split.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Your effective dose</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Caffeine is the most reliable legal performance aid there is, and the effect scales with
              bodyweight — roughly 3 to 6mg per kg, taken half an hour to an hour before you train. A lighter
              person needs meaningfully less than a heavy lifter for the same buzz, which is why a fixed
              300mg scoop hits a 60kg beginner very differently from a 100kg powerlifter. Start at the lower
              end, see how you respond, and never treat the label serving as gospel.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why the half-life matters</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Caffeine clears slowly — about a 5 hour half-life in a typical adult. Take 300mg for a 5pm
              session and you still have around 150mg on board at 10pm and 75mg at 3am. That lingering
              stimulant is the single biggest reason lifters who train late sleep badly, and poor sleep
              blunts recovery far more than a stronger pre-workout ever helped. If your training slot is in
              the evening, a stim-free pump product is almost always the smarter call.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Staying under the ceiling</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Single servings up to 200mg raise no safety concern for healthy adults, and the daily ceiling
              is 400mg from every source combined — pre-workout, coffee, tea, energy drinks and cola all
              count. It is easy to blow past that on a heavy scoop plus a couple of coffees, so we mark any
              pre-workout that pushes a single serving over 400mg down in our scoring. More caffeine is not
              more gains; it is just more jitters, a higher heart rate and worse sleep.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Now find your pre-workout</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Know your number? See which pre-workouts actually hit an effective, sensible caffeine dose —
            and which ones bury an under-dosed scoop behind a huge proprietary blend. Every product is
            scored 0–100 on exactly that.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/strongest-pre-workout"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Strongest pre-workouts →
            </Link>
            <Link
              href="/ingredients/caffeine"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Caffeine explained
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
            healthy adults; if you are pregnant, have a heart condition or take medication, speak to a
            clinician first. Buy links are affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
