import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import MythBuster from './MythBuster'
import { MYTHS, VERDICT_META, verdictCounts, claimAsQuestion } from '@/lib/myths'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/myths`

export const metadata: Metadata = {
  title: 'Supplement Myths vs Facts UK 2026 — What Actually Works | The Lifting Lab',
  description:
    'Does creatine cause hair loss? Do test boosters work? Is pre-workout bad for your heart? An honest, evidence-based verdict on the biggest supplement myths — scored myth, half-true or true.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Myths vs Facts UK 2026 — What Actually Works',
    description:
      'Creatine and hair loss, test boosters, BCAAs, fat burners, the anabolic window — the biggest supplement myths, each given an honest evidence-based verdict.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Myths vs Facts UK 2026 — What Actually Works',
    description:
      'The biggest supplement myths, each given an honest evidence-based verdict: myth, half-true or true.',
  },
}

export default function MythsPage() {
  const counts = verdictCounts()

  // FAQPage schema, backed 1:1 by the reality text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: MYTHS.map((m) => ({
      '@type': 'Question',
      name: claimAsQuestion(m.claim),
      acceptedAnswer: { '@type': 'Answer', text: m.reality },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Supplement Myths', item: URL },
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
            <li aria-current="page" className="text-white/80">Supplement Myths</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Myth vs Fact
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Myths</span> vs Facts
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          The supplement industry runs on half-remembered scares and gym-floor folklore. Here are the
          biggest claims, each given an honest verdict against the actual evidence — the same
          green, amber and red we score products with, turned on the myths themselves.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Of the {MYTHS.length} claims below, {counts.myth} are {VERDICT_META.myth.noun},
          {' '}{counts.partly} are {VERDICT_META.partly.noun}, and {counts.true} are
          {' '}{VERDICT_META.true.noun}. Tap any claim for the reality.
        </p>

        <MythBuster />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Why so many supplement myths stick</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Most supplement myths come from one of three places: a single small study blown out of
              proportion (creatine and hair loss), advice for a specific medical group wrongly applied
              to everyone (protein and kidneys), or marketing that needs you to believe a product is
              essential (test boosters, BCAAs, fat burners). Once a claim is repeated enough on the gym
              floor it feels true, regardless of what the research actually shows.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">The honest short version</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              A very small number of supplements have real evidence behind them — creatine, caffeine,
              enough protein — and most of the rest is convenience or noise. Get your training, protein
              and calories right first, add the two or three proven extras if you want an edge, and
              ignore anything sold as a shortcut. That is the whole game.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              These verdicts are general and evidence-based for healthy adults, and they are about
              supplements, not medicine. Genuinely low testosterone, kidney disease, heart conditions,
              pregnancy and medication interactions are all matters for a qualified clinician — not a
              tub off a shelf and not this page.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/watch-outs"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Watch-Outs</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Myths are the claims; watch-outs are the actual underdosed products to skip — and what to buy instead.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/faq"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Answers</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                The straight how-much and when questions — dosing, timing and what is actually worth taking.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Skip the myths, get the products right</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Every product we track is scored 0–100 on how closely it matches the evidence, so you only
            pay for what actually works — or let the wizard build your whole stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Build my stack →
            </Link>
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Best of 2026
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. Verdicts are general and evidence-based for healthy
            adults; if you take medication, have a health condition, are pregnant or breastfeeding, speak
            to a clinician first.
          </p>
        </section>
      </main>
    </div>
  )
}
