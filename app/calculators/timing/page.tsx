import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import TimingPlanner from './TimingPlanner'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/calculators/timing`

export const metadata: Metadata = {
  title: 'Supplement Timing Planner — When To Take Each Supplement | The Lifting Lab',
  description:
    'Free supplement timing planner. Pick what you take and when you train, and get an evidence-based daily schedule — creatine, whey, pre-workout, vitamin D, magnesium and more — plus the timing myths you can ignore.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Timing Planner — When To Take Each Supplement | The Lifting Lab',
    description:
      'Build your daily supplement schedule around your training time. Which ones are genuinely timing-sensitive, and which you can take whenever. Evidence-based and free.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Timing Planner — When To Take Each Supplement | The Lifting Lab',
    description:
      'Your daily supplement schedule, built around when you train — plus the timing myths you can safely ignore.',
  },
}

// Pure client-side logic, no DB — fully static.
const FAQS = [
  {
    q: 'When should I take creatine?',
    a: 'Any time of day works. Creatine builds up in your muscles over days of consistent use, so 3 to 5g every single day is what matters, not the exact time you take it. The convenient move is to attach it to a daily habit — your morning coffee or your post-workout shake — so you never forget it. Timing has only a marginal, arguably nonexistent effect.',
  },
  {
    q: 'When should I take whey protein?',
    a: 'Whenever helps you hit your daily protein target. The old "anabolic window" of 30 minutes after training has been shown to be hours wide, so a post-workout shake is convenient rather than essential. If you struggle to reach 1.6 to 2.2g of protein per kg of bodyweight from food, use whey to fill the biggest gaps in your day.',
  },
  {
    q: 'When should I take my pre-workout?',
    a: 'About 30 to 45 minutes before you train. Caffeine peaks in your blood roughly 45 to 60 minutes after you take it, and ingredients like citrulline are also acute, so timing genuinely matters here — this is the one category where getting the clock right changes the session. If you train late in the evening, mind the sleep cut-off or go stim-free.',
  },
  {
    q: 'Should I take magnesium or ZMA before bed?',
    a: 'Before bed suits it. Magnesium supports relaxation and sleep quality, so an evening dose is sensible, and ZMA is traditionally taken at night on an empty stomach. Keep it away from calcium or dairy, which can blunt zinc and magnesium absorption. The effect on sleep is modest, but the timing does no harm and may help.',
  },
  {
    q: 'Does supplement timing actually matter?',
    a: 'For most supplements, far less than the internet claims. Creatine and beta-alanine work by saturating your body over weeks, so time of day is irrelevant. Protein, vitamins and omega-3 mainly need to be consistent and, for fat-soluble ones, taken with food. The genuine exceptions are acute pre-workout ingredients — caffeine and citrulline — where dosing shortly before training changes the result. This tool is informational only, not medical advice.',
  },
]

export default function TimingPage() {
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
      { name: 'Supplement Timing', item: URL },
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
            <li aria-current="page" className="text-white/80">Supplement Timing</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tools
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement Timing <span className="text-lab-lime">Planner</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Tell us what you take and when you train, and we&apos;ll build your daily schedule — waking,
          pre-workout, post-workout, dinner and before bed — with the reason each supplement sits where it does.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          The honest bit most sites skip: for the majority of supplements, timing barely moves the needle.
          Creatine and beta-alanine saturate over weeks, so the clock is irrelevant. This planner shows you
          the few things that genuinely are timing-sensitive — and the ones you can take whenever fits your day.
        </p>

        <TimingPlanner />

        {/* sibling tools */}
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
                The take-it-anytime supplement — your exact daily dose for your bodyweight and days to saturation.
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
                The one that truly is timing-critical — your pre-workout dose plus a half-life sleep cut-off.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Timing that genuinely matters</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Only a short list of supplements are truly clock-sensitive, and they are the acute pre-workout
              ingredients. Caffeine peaks in your blood about 45 to 60 minutes after you take it, and citrulline&apos;s
              blood-flow effect is short-lived, so both belong 30 to 60 minutes before you train. Get these right
              and the session feels different; get them wrong and you have wasted the dose. Everything else is far
              more forgiving.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Timing that is mostly a myth</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Creatine and beta-alanine work by slowly saturating your muscles over days and weeks, so the exact
              time of day you take them changes nothing — consistency is the entire game. Protein is the same story
              at the daily level: the &quot;anabolic window&quot; turned out to be hours wide, so a post-workout shake is a
              convenience, not a requirement. Do not let clock-watching distract you from the things that actually
              drive results: total daily dose and taking it every day.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Take fat-soluble things with food</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Vitamin D, a multivitamin&apos;s A, D, E and K, and omega-3 all absorb far better alongside a meal that
              contains some fat than on an empty stomach — that is why the planner slots them next to your biggest
              meals rather than at a fixed hour. Magnesium and ZMA lean toward the evening because magnesium supports
              relaxation and sleep, and ZMA absorbs best away from calcium and dairy.
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
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Now get the products right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Timing only helps once the supplement itself is properly dosed. Every product we track is scored 0–100
            on how closely it matches the evidence — or let the wizard build your whole stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Build my stack →
            </Link>
            <Link
              href="/calculators"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              More calculators
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Timing guidance is general and evidence-based for healthy
            adults; if you have a health condition, are pregnant or take medication, speak to a clinician first.
            Buy links are affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
