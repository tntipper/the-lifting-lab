import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { METHODOLOGY, METHODOLOGY_INDEX } from '@/lib/methodology'
import { GUIDE_SLUGS } from '@/lib/guides'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/methodology`

// Fully static — every word on this page comes from local data (lib/methodology),
// so it prerenders ○ static and can never fail at runtime. This is the crawlable,
// indexable version of the "How We Score" modal: the modal explains the score to a
// user mid-browse, but Google cannot read a client-side modal. For a YMYL (health)
// affiliate site, a transparent, evidence-led methodology page is the single
// strongest E-E-A-T signal we can publish — it is what earns trust in rankings.
export const metadata: Metadata = {
  title: 'How We Score Supplements — The Lifting Lab Methodology',
  description:
    'Exactly how The Lifting Lab scores every supplement: a 0-100 Effectiveness Match against an evidence-based clinical reference dose for each category. Full weightings, global penalties (proprietary blends, amino-spiking, caffeine), and per-category reference specs. No brand deals, no pay-to-win.',
  alternates: { canonical: `${SITE}/methodology` },
  openGraph: {
    title: 'How We Score Supplements — The Lifting Lab Methodology',
    description:
      'The full, transparent scoring methodology behind every Effectiveness Match score: category reference doses, weightings, and penalties. No pay-to-win.',
    url: `${SITE}/methodology`,
    type: 'article',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'How We Score Supplements — The Lifting Lab Methodology',
    description:
      'The full, transparent scoring methodology behind every Effectiveness Match score. No brand deals, no pay-to-win.',
  },
}

// Cross-cutting rules that apply across categories — the honest "how we protect
// the score from marketing" layer. All lifted from the per-category notes so the
// page never contradicts the formulas behind the scores.
const GLOBAL_RULES: { title: string; body: string }[] = [
  {
    title: 'Proprietary blends are penalised',
    body:
      'A "proprietary blend" hides the individual doses behind one total number, so you cannot verify whether any active is dosed effectively. We apply a 15% score penalty and flag it red. Transparency is rewarded, opacity is not.',
  },
  {
    title: 'Amino-spiking scores zero on purity',
    body:
      'Cheap protein powders can be padded with free amino acids (glycine, taurine) to inflate the nitrogen test and fake a higher protein number. Any product we identify as amino-spiked scores zero on the clean-protein weight — it is the cardinal sin of the protein categories.',
  },
  {
    title: 'Caffeine is scored on a window, not "more is better"',
    body:
      'Pre-workouts are penalised in both directions outside the 200-400mg sweet spot: underdosed does nothing, overdosed just raises the crash and jitter risk without extra performance. 400mg is the accepted daily safe ceiling.',
  },
  {
    title: 'We convert marketing doses to real doses',
    body:
      'Citrulline Malate labels inflate the headline number — in a 2:1 malate blend only ~66% is actual citrulline. We convert to the real dose before scoring. Cheap ingredient swaps (NALT for L-Tyrosine, oxide minerals for chelated) are scored at their real, reduced efficacy.',
  },
  {
    title: 'Value is real cost per effective serving',
    body:
      'Where we rank on value we use True Cost — price per full effective serving, not per tub. A cheap product that needs two scoops to hit the effective dose is not actually cheap, and our value ranking exposes that.',
  },
  {
    title: 'Evidence over manufacturer claims',
    body:
      'Every reference dose is drawn from peer-reviewed human evidence (ISSN/JISSN position stands, meta-analyses, NHS/NIH fact sheets), not brand-funded studies or label marketing. Ingredients with only animal data or token doses are flagged, not scored.',
  },
]

const FAQ: { q: string; a: string }[] = [
  {
    q: 'What is an Effectiveness Match score?',
    a: 'It is a 0-100 rating of how closely a product’s active ingredient doses match an evidence-based clinical reference spec for its category. 100 represents a perfect theoretical formula, so real products land below it. It rates the formulation only — not the brand, its safety, or its reputation.',
  },
  {
    q: 'Do brands pay to score higher or appear first?',
    a: 'No. There are no sponsored placements and no paid rankings anywhere on the site. The exact same formula scores every product in a category, and the highest score wins. Buy links are affiliate links that may earn us a commission, but they never influence a score.',
  },
  {
    q: 'Why did a well-known brand score low?',
    a: 'A low score reflects the formulation we measured — usually underdosed actives, a proprietary blend hiding doses, amino-spiking, or poor value per effective serving. It is not a judgement of the company, its manufacturing, or its safety.',
  },
  {
    q: 'What do the score colours mean?',
    a: 'Green (70-100) meets or beats the effective dose for its category. Amber (50-69) is below optimal but usable. Red (under 50) is significantly underdosed or carries a major penalty such as a proprietary blend.',
  },
  {
    q: 'Is a score medical advice?',
    a: 'No. Everything on this page and across the site is informational only and not medical advice. Always consult a qualified clinician before starting or changing supplements, especially hormone-support or any product with a health claim.',
  },
]

export default function MethodologyPage() {
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'How We Score', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  }

  // MedicalWebPage / about-the-methodology entity — tells Google this page is the
  // authoritative explanation of the scoring behind the whole domain (E-E-A-T).
  const aboutJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'MedicalWebPage',
    name: 'How We Score Supplements — The Lifting Lab Methodology',
    url: URL,
    description:
      'The full scoring methodology behind The Lifting Lab: a 0-100 Effectiveness Match against evidence-based clinical reference doses per supplement category.',
    publisher: { '@type': 'Organization', name: 'The Lifting Lab', url: SITE },
    lastReviewed: '2026-07-01',
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(aboutJsonLd) }} />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">How We Score</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          The Methodology
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          How We <span className="text-lab-lime">Score</span> Supplements
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Every product on The Lifting Lab gets an <span className="text-white font-bold">Effectiveness
          Match score from 0 to 100</span> — a dose-for-dose comparison against an evidence-based
          clinical reference spec for its category. No brand deals. No sponsored placements. No
          pay-to-win. Just the numbers on the label measured against what the research says works.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          The perfect 100 belongs to an ideal formula that does not exist, so real products land
          below it. Below is the exact framework — the score tiers, the global penalties that stop
          marketing from gaming the number, and the reference spec for every category we track.
        </p>

        {/* score tiers */}
        <section className="mb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-4">The Score Tiers</h2>
          <div className="space-y-3">
            {[
              { c: '#a6e22e', bg: 'rgba(166,226,46,0.10)', bd: 'rgba(166,226,46,0.35)', label: 'Green · 70–100', body: 'Meets or beats the effective dose. A formula you can rely on.' },
              { c: '#e8a020', bg: 'rgba(232,160,32,0.10)', bd: 'rgba(232,160,32,0.35)', label: 'Amber · 50–69', body: 'Below optimal but usable — often decent actives let down by one weak dose or middling value.' },
              { c: '#e05a2b', bg: 'rgba(224,90,43,0.10)', bd: 'rgba(224,90,43,0.35)', label: 'Red · Under 50', body: 'Significantly underdosed, or carrying a major penalty such as a proprietary blend or amino-spiking.' },
            ].map((t) => (
              <div key={t.label} className="flex items-start gap-4 rounded-xl border p-4" style={{ background: t.bg, borderColor: t.bd }}>
                <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: t.c, boxShadow: `0 0 10px ${t.c}` }} />
                <div>
                  <p className="text-sm font-black uppercase tracking-wide" style={{ color: t.c }}>{t.label}</p>
                  <p className="text-sm text-white/80 leading-relaxed mt-0.5">{t.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* the three ways we rank */}
        <section className="mb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-4">The Three Ways We Rank</h2>
          <div className="space-y-3">
            <div className="flex gap-3 bg-lab-panel border border-lab-border rounded-xl p-4">
              <span className="shrink-0 text-lab-lime text-lg">🏆</span>
              <p className="text-sm text-white/80 leading-relaxed">
                <span className="text-white font-bold">Best Effectiveness Match</span> — ranked purely
                by score. The formula closest to the ideal reference spec wins.
              </p>
            </div>
            <div className="flex gap-3 bg-lab-panel border border-lab-border rounded-xl p-4">
              <span className="shrink-0 text-lab-lime text-lg">💰</span>
              <p className="text-sm text-white/80 leading-relaxed">
                <span className="text-white font-bold">Best Value for Score</span> — ranked by score
                per £ per serving. The most effectiveness for what you actually pay.
              </p>
            </div>
            <div className="flex gap-3 bg-lab-panel border border-lab-border rounded-xl p-4">
              <span className="shrink-0 text-lab-lime text-lg">🎯</span>
              <p className="text-sm text-white/80 leading-relaxed">
                <span className="text-white font-bold">Budget Pick</span> — cheapest per serving among
                products scoring 50 or higher, so you see the quality trade-off clearly.
              </p>
            </div>
          </div>
        </section>

        {/* global penalties / protections */}
        <section className="mb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-2">Global Rules & Penalties</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            These rules apply across every category. They are how we stop clever labelling from
            inflating a score.
          </p>
          <div className="space-y-3">
            {GLOBAL_RULES.map((rule) => (
              <div key={rule.title} className="bg-lab-panel border border-lab-border rounded-xl p-4">
                <p className="text-sm font-black text-white mb-1">{rule.title}</p>
                <p className="text-sm text-white/70 leading-relaxed">{rule.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* per-category reference specs */}
        <section className="mb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-2">
            The Reference Spec, Category by Category
          </h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-6">
            Each category is scored against its own evidence-defined ideal. Here is the weighting and
            reasoning behind every one.
          </p>
          <div className="space-y-8">
            {METHODOLOGY_INDEX.map((entry) => {
              const m = METHODOLOGY[entry.key]
              if (!m) return null
              const hasGuide = GUIDE_SLUGS.includes(entry.categorySlug)
              return (
                <div key={entry.key} className="bg-lab-panel border border-lab-border rounded-2xl p-5">
                  <div className="flex items-baseline justify-between gap-3 mb-3">
                    <h3 className="text-lg font-black uppercase tracking-wide">{entry.title}</h3>
                    <Link
                      href={hasGuide ? `/guide/${entry.categorySlug}` : `/products?category=${entry.categorySlug}`}
                      className="shrink-0 text-[10px] uppercase tracking-widest font-bold text-lab-lime hover:underline"
                    >
                      {hasGuide ? 'Read the guide →' : 'See products →'}
                    </Link>
                  </div>
                  <p className="text-sm text-white/80 leading-relaxed mb-4">{m.blurb}</p>

                  <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">
                    Weighting
                  </p>
                  <div className="space-y-1.5 mb-4">
                    {m.rows.map((row) => (
                      <div
                        key={row.ingredient}
                        className="flex items-center gap-2 bg-black/40 border border-lab-border rounded-lg px-3 py-2"
                      >
                        <span className="text-[12px] font-bold flex-1 min-w-0">{row.ingredient}</span>
                        <span className="text-[12px] text-lab-muted shrink-0">{row.target}</span>
                        <span className="text-[12px] font-black text-lab-lime w-24 text-right shrink-0">{row.weight}</span>
                      </div>
                    ))}
                  </div>

                  {m.notes.length > 0 && (
                    <ul className="space-y-1.5">
                      {m.notes.map((note, i) => (
                        <li key={i} className="text-[12px] text-white/70 flex gap-1.5 leading-relaxed">
                          <span className="text-lab-lime shrink-0">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* what the score is / isn't */}
        <section className="mb-12 rounded-2xl border border-lab-border bg-white/5 p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">
            What the score is — and isn&apos;t
          </h2>
          <p className="text-sm text-white/80 leading-relaxed">
            A score rates a product&apos;s <span className="text-white font-bold">ingredients and
            doses</span> against a category ideal — nothing else. It is <span className="text-white font-bold">not</span> a
            judgement of the brand, its quality, safety, manufacturing, or reputation. A lower score
            reflects the <span className="italic">formulation</span> we measured, not the company
            behind it. We update scores as catalogues and evidence change.
          </p>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-xl font-black uppercase tracking-wide mb-4">Common Questions</h2>
          <div className="space-y-3">
            {FAQ.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-4">
                <p className="text-sm font-black text-white mb-1.5">{f.q}</p>
                <p className="text-sm text-white/70 leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* disclaimer + funnel */}
        <section className="rounded-2xl border border-lab-border bg-lab-panel p-6">
          <p className="text-xs text-lab-muted leading-relaxed mb-5">
            Informational only — not medical advice. Always consult a qualified clinician before
            starting or changing supplements. Buy links across the site are affiliate links; we may
            earn a commission at no extra cost to you, and it never affects a score.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              See the best in every category →
            </Link>
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Build my stack
            </Link>
            <Link
              href="/products"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Browse all products
            </Link>
          </div>
        </section>
      </main>
    </div>
  )
}
