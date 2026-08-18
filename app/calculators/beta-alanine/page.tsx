import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import BetaAlanineCalculator from './BetaAlanineCalculator'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/beta-alanine`

export const metadata: Metadata = {
  title: 'Beta-Alanine Dosage Calculator — How Much To Take | The Lifting Lab',
  description:
    'Free beta-alanine dosage calculator. Enter your bodyweight and get your daily dose, how to split it to control the tingles, and how long a tub lasts — backed by the ISSN evidence.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Beta-Alanine Dosage Calculator — How Much To Take | The Lifting Lab',
    description:
      'Your exact beta-alanine dose for your bodyweight — how much per day, how to split it to stop the tingles, and days per tub. Evidence-based, instant, free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Beta-Alanine Dosage Calculator — How Much To Take | The Lifting Lab',
    description:
      'Your exact beta-alanine dose for your bodyweight — daily amount, how to split it, days per tub. Evidence-based and free.',
  },
}

// Pure client-side maths, no DB — fully static.
const FAQS = [
  {
    q: 'How much beta-alanine should I take per day?',
    a: 'The ISSN puts the effective dose at 3.2 to 6.4 grams of beta-alanine every day. Smaller people sit near the bottom of that range, larger athletes near the top. Like creatine, it works by building up in the muscle over weeks, so the daily habit matters far more than any single dose.',
  },
  {
    q: 'Why does beta-alanine make me tingle?',
    a: 'That pins-and-needles feeling on your face, neck and hands is paraesthesia, and it is completely harmless. It is triggered by larger single doses of standard beta-alanine. Splitting your daily total into smaller doses of around 1.6g, or using a sustained-release version, keeps the tingle to a minimum. It also fades as your body gets used to it.',
  },
  {
    q: 'How long until beta-alanine works?',
    a: 'There is no acute, same-day effect — beta-alanine has nothing to do with the buzz from a pre-workout. It raises muscle carnosine slowly, with meaningful levels reached in about 2 to 4 weeks of consistent daily use and benefits building over roughly 4 to 12 weeks. That is why taking it every day matters more than taking it before training.',
  },
  {
    q: 'When is the best time to take beta-alanine?',
    a: 'Timing does not matter, because the effect is cumulative rather than acute. Take it whenever you will remember, ideally with a meal to be kind to your stomach and because food may modestly aid uptake. You do not need to take it pre-workout, and skipping the odd day will not undo your saturation.',
  },
  {
    q: 'Should I take beta-alanine or is it already in my pre-workout?',
    a: 'Many pre-workouts include beta-alanine, but often at an underdosed 1 to 2g and only on training days, which is not enough to saturate your muscles. Because the benefit comes from taking a full 3.2 to 6.4g every single day, a cheap standalone tub is usually the smarter, better-value way to actually reach an effective dose. This tool is not medical advice.',
  },
]

export default function BetaAlaninePage() {
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
      { name: 'Beta-Alanine Dosage', item: URL },
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
            <li aria-current="page" className="text-white/80">Beta-Alanine Dosage</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Beta-Alanine Dosage <span className="text-lab-lime">Calculator</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Enter your bodyweight and we&apos;ll show your exact beta-alanine dose — how much to take a day,
          how to split it to control the tingles, and how long a tub will last.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Based on the ISSN position stand: the effective dose is 3.2 to 6.4g a day, scaled roughly by
          bodyweight and taken every day for weeks. Beta-alanine works like creatine — it saturates your
          muscle over time — so this tool tells you exactly how much, and how to take it without the buzz.
        </p>

        <BetaAlanineCalculator />

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
                The other big saturation supplement — your exact loading and maintenance dose, plus days to full stores.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>

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
                The pre-workout active that actually gives you the buzz — your effective dose and sleep cut-off.
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
                The pump ingredient — how much of your form to take, and whether your pre-workout underdoses it.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">What beta-alanine actually does</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Beta-alanine is the rate-limiting building block for carnosine, a compound stored in your
              muscle that buffers the acid built up during hard efforts. Raise your carnosine and you can
              push a little longer before the burn forces you to stop. The payoff shows up most in sets and
              intervals lasting roughly one to four minutes — think a brutal set of 20 reps, a rowing piece,
              or a hard finisher — not in a heavy single. It is one of the few pre-workout ingredients with
              genuine evidence behind it, alongside caffeine and creatine.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Dose it like creatine, not caffeine</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is the mistake most people make. Beta-alanine has no acute kick, so taking it only before
              a workout is close to useless. It works exactly like creatine: you take a full daily dose,
              every day, and your muscle stores climb over two to four weeks until they plateau. Four to six
              grams a day, scaled gently to your bodyweight, is the target — whether it is a training day or
              a rest day. Consistency is the entire game.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The tingles, and how to kill them</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              That flushing, prickly feeling on your skin is paraesthesia. It is harmless, it fades as you
              adapt, and it is purely a function of dose size, not a sign the product is working. If it
              bothers you, split your daily total into smaller doses of around 1.6g taken through the day, or
              switch to a sustained-release formula that drip-feeds it and lets you take larger amounts in
              one go. Either way your muscle ends up in the same saturated place.
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
            The beta-alanine tucked into most pre-workouts is underdosed and only taken on training days,
            so it never saturates. A cheap standalone tub, or a genuinely well-dosed pre-workout, is how you
            actually reach an effective dose. Every product we track is scored 0–100 on exactly that.
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
