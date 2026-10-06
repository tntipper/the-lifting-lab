import { formatListedServingPrice } from '@/lib/products'
import { serializeJsonForHtml } from '@/lib/json-for-html'
import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ProductAssessment from '@/components/ProductAssessment'
import ProductOfferLink from '@/components/ProductOfferLink'
import {
  fetchPreWorkoutRows,
  HIGH_STIM_MG,
  SINGLE_DOSE_MG,


  type PreWorkoutRow,
} from '@/lib/pre-workout-actives'

// SSG with a daily refresh so newly added pre-workouts and label updates flow
// into the caffeine ranking without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/strongest-pre-workout`
const YEAR = 2026

export const metadata: Metadata = {
  "title": "Pre-workout caffeine label comparison",
  "description": "Compare recorded caffeine amounts and other label data. Higher amounts are not an endorsement; no approved effectiveness score is available.",
  "alternates": {
    "canonical": "https://www.theliftinglab.co.uk/strongest-pre-workout"
  },
  "openGraph": {
    "title": "Pre-workout caffeine label comparison",
    "description": "Compare recorded caffeine amounts and other label data. Higher amounts are not an endorsement; no approved effectiveness score is available.",
    "url": "https://www.theliftinglab.co.uk/strongest-pre-workout",
    "type": "website"
  },
  "twitter": {
    "card": "summary_large_image",
    "title": "Pre-workout caffeine label comparison",
    "description": "Compare recorded caffeine amounts and other label data. Higher amounts are not an endorsement; no approved effectiveness score is available."
  }
}

function citrullineLabel(r: PreWorkoutRow): string {
  if (r.citrullineG == null) return '—'
  const suffix = r.citrullineForm === 'malate' ? ' malate' : ''
  return `${r.citrullineG}g${suffix}`
}

export default async function StrongestPreWorkoutPage() {
  const rows = await fetchPreWorkoutRows()
  const ranked = rows.slice(0, 10)

  const itemListJsonLd =
    rows.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Caffeine Label Comparison UK ${YEAR}`,
          description: `UK pre-workouts ranked by caffeine content per serving for ${YEAR}.`,
          itemListOrder: 'https://schema.org/ItemListOrderDescending',
          numberOfItems: ranked.length,
          itemListElement: ranked.map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Product',
              name: `${r.brand} ${r.name}`,
              brand: { '@type': 'Brand', name: r.brand },
              category: 'Pre-Workout',
              url: `${SITE}/products/${r.id}`,
            },
          })),
        }
      : null

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'What is the strongest pre-workout in the UK?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'This page orders recorded caffeine amounts per serving. A higher amount is not a quality grade or recommendation. Historical formula scores are unverified and cannot establish effective dosing.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much caffeine is safe in a pre-workout?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            `The European Food Safety Authority considers up to ${HIGH_STIM_MG} mg of caffeine a day safe for most healthy adults, and single doses up to ${SINGLE_DOSE_MG} mg raise no safety concern. Many pre-workouts pack ${HIGH_STIM_MG} mg or more in one scoop, so start with a half scoop to assess tolerance, avoid stacking with coffee or energy drinks, and do not take it within about six hours of bed. Pregnant women should stay under 200 mg a day.`,
        },
      },
      {
        '@type': 'Question',
        name: 'Does more caffeine mean a better pre-workout?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'No. Higher caffeine content is not an effectiveness or quality recommendation. Historical formula values remain unverified; consult the recorded amounts and the caffeine cautions separately.',
        },
      },
      {
        '@type': 'Question',
        name: 'What do the recorded beta-alanine and citrulline amounts mean?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'The figures are recorded label amounts, not approved dosing targets or proof of benefit. Ingredient forms, serving sizes and individual circumstances differ. No product effectiveness recommendation is available.',
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Caffeine Label Comparison ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const row = (r: PreWorkoutRow, i: number) => {
    const highStim = r.caffeineMg > HIGH_STIM_MG
    return (
      <div
        key={r.id}
        className="bg-lab-panel border rounded-xl p-4"
        style={{ borderColor: '#262626' }}
      >
        <div className="flex items-center gap-4">
          <span className="text-xl shrink-0 w-6 text-center">
            {`#${i + 1}`}
          </span>
          <ProductAssessment product={r} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/products/${r.id}`} className="hover:text-lab-lime transition-colors">
              <p className="text-white text-sm font-black leading-tight truncate">{r.brand}</p>
            </Link>
            <p className="text-lab-muted text-xs truncate">{r.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-lab-muted mt-1">
              {r.costPerServing != null ? `${formatListedServingPrice(r.costPerServing)}/serving` : 'Listed serving price unavailable'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="text-base font-black leading-none"
              style={{ color: highStim ? '#e05a2b' : '#9ca3af' }}
            >
              {r.caffeineMg}mg
            </p>
            <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">caffeine</p>
          </div>
        </div>

        {/* actives strip */}
        <div className="flex flex-wrap gap-2 mt-3">
          {highStim && (
            <span
              className="text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-full"
              style={{ background: 'rgba(224,90,43,0.12)', color: '#e05a2b', border: '1px solid rgba(224,90,43,0.4)' }}
            >
              High stim · over {HIGH_STIM_MG}mg
            </span>
          )}
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 text-lab-muted border border-lab-border">
            β-Alanine {r.betaAlanineG != null ? `${r.betaAlanineG}g` : '—'}

          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 text-lab-muted border border-lab-border">
            Citrulline {citrullineLabel(r)}

          </span>
        </div>

        <div className="grid grid-cols-3 gap-2 mt-3">
          <Link
            href={`/products/${r.id}`}
            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
          >
            Details
          </Link>
          <Link
            href="/guide/pre-workout"
            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
          >
            Guide
          </Link>
          <ProductOfferLink
            product={r}
            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
            style={{
              background: 'rgba(166,226,46,0.12)',
              color: '#a6e22e',
              border: '1px solid rgba(166,226,46,0.5)',
            }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      {itemListJsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(itemListJsonLd) }}
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(faqJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonForHtml(breadcrumbJsonLd) }}
      />

      <main className="max-w-3xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/" className="hover:text-white">
                Home
              </Link>
            </li>
            <li aria-hidden className="text-lab-border">
              /
            </li>
            <li aria-current="page" className="text-white/80">
              Caffeine Label Comparison {YEAR}
            </li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Caffeine Content Ranked · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Caffeine Label Comparison <span className="text-lab-lime">UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Every UK pre-workout below is ranked by the number that decides how &ldquo;strong&rdquo; it
          feels: caffeine per serving. We also list the beta-alanine and citrulline dose, because a
          proper pre-workout does far more than just wire you.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
Historical values are unverified and do not establish formula quality or effective dosing. This ordering describes caffeine content only; it is not a recommendation to choose a higher amount.
        </p>

        {/* safety callout */}
        <div
          className="rounded-2xl p-5 mb-10"
          style={{ background: 'rgba(224,90,43,0.08)', border: '1px solid rgba(224,90,43,0.3)' }}
        >
          <p className="text-sm font-black uppercase tracking-wide mb-2" style={{ color: '#e05a2b' }}>
            ⚠️ Caffeine safety
          </p>
          <p className="text-white/80 text-sm leading-relaxed">
            The EFSA safe limit is {HIGH_STIM_MG} mg of caffeine a day for most healthy adults, with
            single doses up to {SINGLE_DOSE_MG} mg raising no concern. Several pre-workouts here exceed{' '}
            {HIGH_STIM_MG} mg in a single scoop (flagged in red). Start with a half scoop to assess
            tolerance, do not stack with coffee or energy drinks, and avoid it within six hours of bed.
            Informational only — not medical advice.
          </p>
        </div>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">⚡</p>
            <p className="text-sm">Pre-workout caffeine rankings are being tallied. Check back shortly.</p>
          </div>
        ) : (
          <>
            <section className="mb-12">
              <h2 className="text-xl font-black uppercase tracking-wide mb-1">
                Ranked by <span className="text-lab-lime">Caffeine</span>
              </h2>
              <p className="text-lab-muted text-sm mb-5">
                Most caffeine per serving first. Amounts are label records, not effective-dose endorsements.
              </p>
              <div className="space-y-3">{ranked.map((r, i) => row(r, i))}</div>
            </section>

            {rows.length > ranked.length && (
              <section className="mb-12">
                <h2 className="text-lg font-black uppercase tracking-wide mb-4">
                  The rest of the field
                </h2>
                <div className="space-y-3">
                  {rows.slice(ranked.length).map((r, i) => row(r, i + ranked.length))}
                </div>
              </section>
            )}

            {/* FAQ — visible, backing the FAQPage schema 1:1 */}
            <section className="mb-4">
              <h2 className="text-xl font-black uppercase tracking-wide mb-5">
                Pre-Workout Caffeine <span className="text-lab-lime">FAQ</span>
              </h2>
              <div className="space-y-4">
                {faqJsonLd.mainEntity.map((q) => (
                  <div key={q.name} className="bg-lab-panel border border-lab-border rounded-xl p-4">
                    <p className="text-sm font-black text-white mb-2">{q.name}</p>
                    <p className="text-lab-muted text-sm leading-relaxed">{q.acceptedAnswer.text}</p>
                  </div>
                ))}
              </div>
            </section>

            {/* methodology + funnel */}
            <section className="mt-10 bg-lab-panel border border-lab-border rounded-2xl p-6">
              <h2 className="text-lg font-black uppercase tracking-wide mb-3">
                How this ranking works
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">No approved effectiveness assessment is available. Historical percentages are unverified and do not establish dosing, product quality or a recommendation. Labels and listed prices remain available for research.</p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Retailer links carry their own disclosures. This never affects scoring or rankings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/best/pre-workout"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  Best pre-workout →
                </Link>
                <Link
                  href="/guide/pre-workout"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Pre-workout guide
                </Link>
                <Link
                  href="/calculators/caffeine"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Caffeine calculator
                </Link>
                <Link
                  href="/products?category=pre-workout"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse pre-workouts
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
