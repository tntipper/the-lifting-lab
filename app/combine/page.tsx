import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CombineChecker from './CombineChecker'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/combine`

export const metadata: Metadata = {
  title: 'Can I Take These Supplements Together? Combination Checker | The Lifting Lab',
  description:
    'Free supplement combination checker. Pick what you take — creatine, pre-workout, whey, caffeine, multivitamin and more — and get an honest, evidence-based verdict on whether they mix, plus the double-dosing traps to watch.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Can I Take These Supplements Together? Combination Checker | The Lifting Lab',
    description:
      'Check whether your supplements mix. Honest, evidence-based verdicts on combining creatine, caffeine, pre-workout, protein, vitamins and more — plus the real caffeine and double-dosing traps.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Can I Take These Supplements Together? Combination Checker | The Lifting Lab',
    description:
      'Pick your supplements and get an honest verdict on whether they combine — plus the caffeine and double-dosing traps most sites skip.',
  },
}

// Pure client-side logic, no DB — the page is fully static.
const FAQS = [
  {
    q: 'Can I take creatine and pre-workout together?',
    a: 'Yes. They combine perfectly — in fact most pre-workouts already contain creatine. The only thing to watch is double-dosing: check your pre-workout label, because if it already has 3g of creatine you may only need a small top-up to reach the 3 to 5g daily target rather than a full second scoop.',
  },
  {
    q: 'Does caffeine cancel out creatine?',
    a: 'No. That myth came from a single dated study and has not been supported since. At normal doses, caffeine and creatine work fine together, which is exactly why the two are combined in almost every pre-workout on the market.',
  },
  {
    q: 'Can I take pre-workout and coffee together?',
    a: 'You can, but this is the one combination to be careful with. Both are caffeine sources, so stacking a scoop of pre-workout on top of coffee or a caffeine pill can push you past a sensible dose. Add up the total, aim to stay under about 400mg of caffeine a day, and keep a single pre-workout dose to roughly 3mg per kg of bodyweight.',
  },
  {
    q: 'Can I take a multivitamin and vitamin D at the same time?',
    a: 'Yes, but check for overlap. Most multivitamins already contain vitamin D, so taking a separate high-dose D on top can double you up. Add both amounts together and keep the total under 100 micrograms (4000 IU) a day unless a clinician has told you otherwise.',
  },
  {
    q: 'Do I need EAAs or BCAAs if I already take whey?',
    a: 'Usually not. Whey is a complete protein that already contains all nine essential amino acids, including the BCAAs. If you are hitting your daily protein target with whey and food, a separate EAA or BCAA product is generally redundant spend rather than a safety concern.',
  },
  {
    q: 'Is it safe to take lots of supplements at once?',
    a: 'For most common supplements combined sensibly, yes — the bigger risks are wasting money on redundant products and silently double-dosing caffeine or fat-soluble vitamins. This tool is informational only and covers healthy adults combining supplements. It does not cover interactions with medication or medical conditions, so if either applies to you, speak to a pharmacist or doctor first.',
  },
]

export default function CombinePage() {
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
      { name: 'Combination Checker', item: URL },
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
            <li aria-current="page" className="text-white/80">Combination Checker</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Free Tool
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Can I Take These <span className="text-lab-lime">Together?</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Tap the supplements you take and get an honest, evidence-based verdict on every pairing — what mixes
          freely, what to watch, and the one combination worth real caution.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          The honest bit most sites skip: almost nothing on this list is dangerous to combine. The genuine traps
          are stacking too much caffeine and silently double-dosing an ingredient your pre-workout already
          contains. This checker surfaces both.
        </p>

        <CombineChecker />

        {/* sibling tool */}
        <div className="mt-4 grid gap-3">
          <Link
            href="/calculators/timing"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">
                Supplement tool
              </p>
              <p className="text-sm font-black uppercase tracking-wide text-white">
                Supplement Timing Planner
              </p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Combining is the &ldquo;can I?&rdquo; — timing is the &ldquo;when?&rdquo;. Build a daily schedule around your training time.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </div>

        {/* educational copy — gives the static page real crawlable content */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The real risk is caffeine, not the mix</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Most supplement combinations are perfectly fine — creatine with whey, protein with vitamins, magnesium
              with omega-3. The combination people should actually be careful with is stacking caffeine: a strong
              pre-workout can carry 200 to 350mg, and adding coffee or an energy drink on top climbs quickly. Keep
              your total under about 400mg a day, cap a single pre-workout dose near 3mg per kilo of bodyweight, and
              respect the 5 to 6 hour half-life if you train in the evening.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The double-dosing trap</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Pre-workouts are blends, so if you also take standalone citrulline, beta-alanine, caffeine or creatine
              you may be doubling up without realising. That is rarely dangerous, but it is wasteful and can push
              caffeine too high. Read the label, add up your true totals, and only top up what falls short of the
              effective dose. The same logic applies to vitamins — a multivitamin plus a separate vitamin D or ZMA
              can quietly stack your fat-soluble vitamins and minerals.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Redundant, not harmful</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Some pairings are safe but pointless. Whey already contains every essential amino acid, so a separate
              EAA or BCAA product on top is usually money better spent elsewhere. Collagen is a protein too, but a
              low-quality one missing key muscle-building aminos, so take it for skin and joints if you like — just
              do not count it toward the protein target your whey is there to hit.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this tool stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This checker only covers combining supplements with other supplements for healthy adults. It does not
              assess interactions with prescription or over-the-counter medication, and it is not a substitute for
              medical advice. If you take medication, have a health condition, are pregnant or breastfeeding, check
              with a pharmacist or doctor before adding anything new.
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
            Combining safely only matters once each supplement is properly dosed. Every product we track is scored
            0–100 on how closely it matches the evidence — or let the wizard build your whole stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Build my stack →
            </Link>
            <Link
              href="/stacks"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Ready-made stacks
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Combination guidance is general and evidence-based for healthy
            adults; if you take medication, have a health condition, are pregnant or breastfeeding, speak to a
            clinician first. Buy links are affiliate links; we may earn a commission at no extra cost to you.
          </p>
        </section>
      </main>
    </div>
  )
}
