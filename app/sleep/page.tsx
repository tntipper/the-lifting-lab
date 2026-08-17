import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import SleepBoard from './SleepBoard'
import { SLEEP_ITEMS, itemCount, tierCount } from '@/lib/sleep'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/sleep`

export const metadata: Metadata = {
  title: 'Best Supplements for Sleep UK 2026 — What Actually Works | The Lifting Lab',
  description:
    'An honest, evidence-based rating of sleep and recovery supplements: what really helps (a fixed schedule, caffeine timing, magnesium, ashwagandha, melatonin), what is weak, and what to skip (GABA, 5-HTP, PM blends). Not medical advice.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Best Supplements for Sleep — What Actually Works',
    description:
      'A fixed schedule, caffeine timing, magnesium, ashwagandha and melatonin vs GABA, 5-HTP and "PM" blends. The honest, evidence-based verdict on sleeping better.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Best Supplements for Sleep — What Actually Works',
    description:
      'The evidence-based verdict on sleep and recovery supplements — the real levers, the weak bets, and the ones to skip.',
  },
}

export default function SleepPage() {
  // FAQPage schema, backed 1:1 by the detail text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: SLEEP_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: { '@type': 'Answer', text: `${item.detail} ${item.bottomLine}` },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Sleep & Recovery', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const worksN = tierCount('works')

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
            <li aria-current="page" className="text-white/80">Sleep &amp; Recovery</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Sleep &amp; Recovery
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Best Supplements for <span className="text-lab-lime">Sleep</span> — What Actually Works
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The sleep aisle is full of &ldquo;PM&rdquo; tubs and knockout blends, and most of them lean on
          ingredients that barely move the needle. Here is the honest version: the handful of habits and
          supplements with real evidence behind them, the weak bets, and the ones to skip — scored in the
          same green, amber and red we use on products.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {itemCount()} of the most-searched sleep levers below, and only {worksN} carry real evidence —
          most of those are free habits, not pills. Tap any one for the full verdict.
        </p>

        {/* clinical callout — this is a health-adjacent topic, so it leads, not hides in the footer */}
        <div
          className="rounded-2xl p-5 mb-8 border"
          style={{ borderColor: 'rgba(245,166,35,0.35)', background: 'rgba(245,166,35,0.06)' }}
        >
          <p className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: '#f5a623' }}>
            Read this first
          </p>
          <p className="text-sm text-white/85 leading-relaxed">
            Ongoing insomnia is a medical issue, not a supplement gap. If you regularly cannot fall or stay
            asleep, wake unrefreshed, snore heavily or feel exhausted in the day, that deserves a GP — it can
            point to things a tub will never fix. Melatonin is a prescription-only medicine in the UK, and
            anything you take alongside a medication is a question for a doctor or pharmacist. Everything
            below is general, evidence-based information, not medical advice.
          </p>
        </div>

        {/* verdict legend */}
        <div className="grid gap-2 mb-8">
          {(['works', 'maybe', 'skip'] as const).map((v) => {
            const m = {
              works: { label: 'Real Evidence', color: '#a6e22e', blurb: 'Genuinely helps sleep or the rhythm behind it — mostly the free habits, plus a couple of supplements used for the right reason.' },
              maybe: { label: 'Weak / Situational', color: '#f5a623', blurb: 'Some evidence or a sensible mechanism, but small, mixed, or mainly useful if anxiety or a shortfall is the real problem.' },
              skip: { label: 'Skip It', color: '#e05a2b', blurb: 'Poorly absorbed, thin evidence, or a marketing blend. Better sleep is elsewhere on this list.' },
            }[v]
            return (
              <div
                key={v}
                className="flex items-start gap-3 bg-lab-panel border border-lab-border rounded-xl p-3"
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}66`, minWidth: 92, textAlign: 'center' }}
                >
                  {m.label}
                </span>
                <p className="text-xs text-lab-muted leading-snug">{m.blurb}</p>
              </div>
            )
          })}
        </div>

        <SleepBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The biggest wins are free</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The uncomfortable truth for the sleep-supplement industry is that the things that improve sleep
              most cost nothing: a consistent wake time, cutting caffeine off in good time, keeping alcohol
              away from bedtime, and getting daylight early and dark late. Nail those and you have out-done
              any &ldquo;night-time&rdquo; tub on the shelf. Supplements only earn a place on top of those habits, not
              instead of them.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Most of the pills are gentle nudges, not knockouts</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Magnesium, glycine, L-theanine and tart cherry can each help a little, especially if a shortfall
              or an anxious, wired mind is what keeps you up. But they are nudges, not sedatives, and the effect
              is modest and person-dependent. Ashwagandha has the strongest evidence for stress-driven poor
              sleep, and melatonin genuinely works for timing problems — but melatonin is prescription-only in
              the UK, so that one runs through a clinician, not an overseas order.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is general, evidence-based information, not medical advice or a diagnosis. Persistent
              insomnia, suspected sleep apnoea, melatonin, 5-HTP alongside any medication, and any decision
              about a sleep drug are matters for a doctor or pharmacist who can assess and monitor you, not a
              label or an article.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/testosterone"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Natural Testosterone Support</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Sleep is the single biggest natural-testosterone lever — the same honest treatment applied to boosting testosterone.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/side-effects"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Side Effects &amp; Safety</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Before you take anything above, the honest safety profile of each supplement and who should be careful.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/combine"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Can I Take These Together?</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Stacking magnesium, ashwagandha or a sleep aid with your other supplements — the interaction checker.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Buy the few things that help, done right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            If a supplement earns its place — magnesium glycinate, a standardised ashwagandha, maybe glycine —
            the job is buying it at a proper dose without overpaying. Every product we track is scored
            0&ndash;100 on how closely it matches the evidence, with the true cost per effective serving, or
            let the wizard build a clean, sensible stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/products?category=magnesium"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Browse magnesium →
            </Link>
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Build my stack
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Persistent insomnia, suspected sleep apnoea and any sleep
            medicine (including melatonin, which is prescription-only in the UK) are matters for a clinician;
            supplement effects are general and evidence-based for healthy adults, and any interaction with a
            medication or health condition is a question for a doctor or pharmacist.
          </p>
        </section>
      </main>
    </div>
  )
}
