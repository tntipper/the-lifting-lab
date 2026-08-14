import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import FormsBoard from './FormsBoard'
import { FORMS, VERDICT_META, formsQuestion, optionCount } from '@/lib/forms'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/forms`

export const metadata: Metadata = {
  title: 'Which Form Should You Buy? Supplement Forms Compared UK 2026 | The Lifting Lab',
  description:
    'Creatine monohydrate vs HCL, magnesium glycinate vs citrate, whey isolate vs concentrate, vitamin D2 vs D3, KSM-66 vs Sensoril. The form of each supplement worth buying — and the ones to skip.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Forms Compared — Which Form Should You Buy?',
    description:
      'Monohydrate vs HCL, glycinate vs oxide, isolate vs concentrate, D2 vs D3. The best-value form of every big supplement, scored buy, situational or skip.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Forms Compared — Which Form Should You Buy?',
    description:
      'The right form of each supplement to buy — monohydrate, glycinate, isolate, D3 — and the overpriced or poorly absorbed forms to skip.',
  },
}

export default function FormsPage() {
  // FAQPage schema, backed 1:1 by the detail text rendered in the board below.
  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FORMS.map((f) => ({
      '@type': 'Question',
      name: formsQuestion(f.name),
      acceptedAnswer: { '@type': 'Answer', text: `${f.detail} ${f.bottomLine}` },
    })),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Which Form to Buy', item: URL },
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
            <li aria-current="page" className="text-white/80">Which Form to Buy</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Which Form to Buy
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement <span className="text-lab-lime">Forms</span> Compared
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Same supplement, five spellings on the shelf. Monohydrate or HCL? Glycinate or oxide?
          Isolate or concentrate? D2 or D3? The form you pick decides how much you actually absorb —
          and how much you overpay. Here is the one worth buying for each, scored in the same green,
          amber and red we use on products.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          {FORMS.length} of the biggest supplements below, {optionCount()} forms weighed up. Tap any
          one for the per-form verdict and a plain buy-this bottom line.
        </p>

        {/* verdict legend */}
        <div className="grid gap-2 mb-8">
          {(['best', 'fine', 'skip'] as const).map((v) => {
            const m = VERDICT_META[v]
            return (
              <div
                key={v}
                className="flex items-start gap-3 bg-lab-panel border border-lab-border rounded-xl p-3"
              >
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${m.color}22`, color: m.color, border: `1px solid ${m.color}66` }}
                >
                  {m.label}
                </span>
                <p className="text-xs text-lab-muted leading-snug">{m.blurb}</p>
              </div>
            )
          })}
        </div>

        <FormsBoard />

        {/* educational copy — extra crawlable framing */}
        <section className="mt-12 space-y-6">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Form decides absorption, not the label number</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              A big milligram number on the front tells you nothing if the form barely absorbs. Magnesium
              oxide and zinc oxide look strong on paper and land weak in your bloodstream; glycinate and
              picolinate look identical on the label but actually get in. The form is the difference
              between a supplement working and a supplement decorating your shelf.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Newer is not the same as better</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              Supplement marketing loves an upgrade. Creatine HCL, Kre-Alkalyn and ethyl ester were all
              sold as the next step past monohydrate, and every head-to-head trial put monohydrate back on
              top for a fraction of the price. When a brand charges more for a rebranded form, ask what the
              evidence says versus the original — usually nothing.
            </p>
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-wide mb-2">Where this page stops</h2>
            <p className="text-lab-muted text-sm leading-relaxed">
              This is general, evidence-based information to help you buy the better-value form, not medical
              advice. Doses, deficiencies and interactions with any medication or health condition —
              including things like B12 absorption problems or iron levels — are matters for a clinician or
              pharmacist, not a label.
            </p>
          </div>
        </section>

        {/* sibling surfaces */}
        <section className="mt-12 grid gap-3">
          <Link
            href="/ingredients-vs"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Ingredient vs Ingredient</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                This page compares forms of the same supplement; the ingredient matchups pit different actives against each other.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
          <Link
            href="/glossary"
            className="flex items-center justify-between gap-4 bg-lab-panel border border-lab-border rounded-2xl p-5 hover:border-lab-lime/50 transition-colors group"
          >
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-1">Related</p>
              <p className="text-sm font-black uppercase tracking-wide text-white">Label &amp; Jargon Decoder</p>
              <p className="text-xs text-lab-muted leading-snug mt-1">
                Bisglycinate, anhydrous, standardised, phytosome — every confusing word on a supplement label, in plain English.
              </p>
            </div>
            <span className="text-lab-lime text-lg font-black shrink-0 group-hover:translate-x-1 transition-transform">→</span>
          </Link>
        </section>

        {/* funnel */}
        <section className="mt-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">Right form, right product</h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            Picking the better form is half the job; the other half is not overpaying for it. Every product
            we track is scored 0&ndash;100 on how closely it matches the evidence, with the true cost per
            effective serving — or let the wizard build a clean, sensible stack for you in a minute.
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
            Informational only — not medical advice. Form comparisons are general and evidence-based for
            healthy adults; doses and any interaction with medication or a health condition are matters for
            a clinician or pharmacist.
          </p>
        </section>
      </main>
    </div>
  )
}
