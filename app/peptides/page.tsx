import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import PeptidesBoard from './PeptidesBoard'
import { PEP_ITEMS, itemCount, tierCount } from '@/lib/peptides'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/peptides`

export const metadata: Metadata = {
  title: 'Peptides UK 2026 — What Works, What Is Legal, What to Avoid | The Lifting Lab',
  description:
    'An honest, evidence-based guide to peptides: the food-form ones worth buying (collagen, protein hydrolysates), the licensed medicines that belong with a doctor (GLP-1s), and the unlicensed injectables to avoid (BPC-157, TB-500, GH secretagogues). Not medical advice.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Peptides — What Works, What Is Legal, What to Avoid',
    description:
      'Collagen and protein peptides vs BPC-157, TB-500 and the grey-market injectables. The honest, evidence-based, UK-legal verdict on peptides.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Peptides — What Works, What Is Legal, What to Avoid',
    description:
      'The evidence-based verdict on peptides — the few that are proven and legal, the prescription medicines, and the injectables to steer clear of.',
  },
}

export default function PeptidesPage() {
  // FAQPage schema, backed 1:1 by the detail text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: PEP_ITEMS.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: `${item.detail} ${item.bottomLine}` },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Peptides', item: URL },
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
            <li aria-current="page" className="text-white/80">Peptides</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Peptides, Honestly
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          <span className="text-lab-lime">Peptides</span> — What Works, What Is Legal, What to Avoid
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          &ldquo;Peptides&rdquo; is one of the most hyped words in fitness right now, and most of what is being sold
          online is unlicensed injectables with the marketing miles ahead of the evidence. Here is the honest
          version: the few peptides that are actually proven and legal to buy, the powerful ones that are
          prescription medicines, and the grey-market vials to steer clear of — scored in the same green, amber
          and red we use on products.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {itemCount()} of the most-searched peptides below, and only {worksN} are things you can genuinely buy
          off a shelf and trust. Tap any one for the full verdict.
        </p>

        {/* legal + clinical callout — health- and law-adjacent, so it leads, not hides */}
        <div
          className="rounded-2xl p-5 mb-8 border"
          style={{ borderColor: 'rgba(224,90,43,0.4)', background: 'rgba(224,90,43,0.07)' }}
        >
          <p className="text-[10px] uppercase tracking-widest font-black mb-2" style={{ color: '#e05a2b' }}>
            Read this first
          </p>
          <p className="text-sm text-white/85 leading-relaxed">
            Most injectable peptides sold online (BPC-157, TB-500, GH secretagogues and the rest) are not licensed
            medicines. In the UK they cannot legally be sold for human consumption and are marketed as
            &ldquo;research chemicals not for human use&rdquo;, their purity and contents are unverified, and most are banned
            in sport by WADA. This page gives no dosing or sourcing information for any unlicensed peptide, and it
            never tells you to inject anything. Genuine medicines like the GLP-1 fat-loss injections are exactly
            that — medicines — and belong with a doctor who can prescribe and monitor them. Everything here is
            general, evidence-based information, not medical advice.
          </p>
        </div>

        {/* verdict legend */}
        <div className="grid gap-2 mb-8">
          {(['works', 'maybe', 'skip'] as const).map((v) => {
            const m = {
              works: { label: 'Proven & Legal', color: '#a6e22e', blurb: 'A genuine, evidence-backed food-form peptide you can actually buy — with honest limits on what it does.' },
              maybe: { label: 'Rx / Early', color: '#f5a623', blurb: 'A prescription medicine that must be clinician-managed, or something with only preliminary human evidence. Never a self-sourced vial.' },
              skip: { label: 'Hype / Do Not Self-Source', color: '#e05a2b', blurb: 'An unlicensed injectable sold as a "research chemical" — unproven in humans, banned in sport, and illegal to sell for human use in the UK.' },
            }[v]
            return (
              <div
                key={v}
                className="flex items-start gap-3 bg-lab-panel border border-lab-border rounded-xl p-3"
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}66`, minWidth: 108, textAlign: 'center' }}
                >
                  {m.label}
                </span>
                <p className="text-xs text-lab-muted leading-snug">{m.blurb}</p>
              </div>
            )
          })}
        </div>

        <PeptidesBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Not all &ldquo;peptides&rdquo; are the same thing</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              A peptide is just a short chain of amino acids, so the word covers wildly different things. The
              &ldquo;peptides&rdquo; on your protein tub are food. Collagen peptides are a normal supplement. GLP-1s are
              licensed medicines. And the injectables the internet is obsessed with — BPC-157, TB-500, the GH
              secretagogues — are unlicensed research chemicals. Lumping them together is exactly how the hype
              gets sold, so this page keeps them in separate lanes.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">&ldquo;Promising in rats&rdquo; is not &ldquo;proven and safe in you&rdquo;</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              The recovery peptides are sold on genuinely interesting animal studies, but almost none have the
              human trials that would show they are safe and effective — let alone at what dose, for how long, or
              for whom. Injecting an unregulated compound of unknown purity, with no monitoring, on the strength of
              rodent data is a real risk for a benefit that has never been demonstrated in people.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is general, evidence-based information, not medical advice, a prescription or a how-to. Any
              decision involving a licensed medicine — GLP-1s, PT-141, growth-hormone therapy — is a matter for a
              doctor or pharmacist who can assess you and monitor treatment. We deliberately give no dosing or
              sourcing guidance for unlicensed peptides, because the honest answer is not to self-source them.
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
                The honest, evidence-based version of raising testosterone — the real levers, the weak bets, and the boosters to skip.
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
                The honest safety profile of the mainstream supplements — creatine, pre-workout, ashwagandha and more.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/myths"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Supplement Myths, Debunked</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                This page rates the peptide claims; the myths hub takes on the biggest supplement claims across the board.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Spend on what actually moves the needle</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            The unglamorous truth is that the things that build muscle, aid recovery and support your hormones are
            the boring, proven, legal ones — enough protein, creatine, sleep and a sensible base of supplements at
            a proper dose. Every product we track is scored 0&ndash;100 on how closely it matches the evidence, with
            the true cost per effective serving, or let the wizard build a clean, sensible stack in a minute.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best supplements 2026 →
            </Link>
            <Link
              href="/wizard"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Build my stack
            </Link>
          </div>
          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-5">
            Informational only — not medical advice. No dosing or sourcing information is given for any unlicensed
            peptide. Licensed medicines, and any decision involving hormones or injectables, are matters for a
            clinician who can assess and monitor; anything you take alongside a medication or health condition is a
            question for a doctor or pharmacist.
          </p>
        </section>
      </main>
    </div>
  )
}
