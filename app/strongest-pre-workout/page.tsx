import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { buyLink } from '@/lib/affiliate'
import {
  fetchPreWorkoutRows,
  HIGH_STIM_MG,
  SINGLE_DOSE_MG,
  BETA_ALANINE_TARGET_G,
  CITRULLINE_TARGET_G,
  type PreWorkoutRow,
} from '@/lib/pre-workout-actives'

// SSG with a daily refresh so newly added pre-workouts and label updates flow
// into the caffeine ranking without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/strongest-pre-workout`
const YEAR = 2026

export const metadata: Metadata = {
  title: `Strongest Pre-Workouts UK ${YEAR} — Caffeine Content Ranked`,
  description:
    'UK pre-workouts ranked by caffeine per serving, plus beta-alanine and citrulline content and our effectiveness score. See the strongest, highest-caffeine pre-workouts and how they compare to the 400 mg daily safe limit.',
  alternates: { canonical: URL },
  openGraph: {
    title: `Strongest Pre-Workouts UK ${YEAR} — Caffeine Content Ranked`,
    description:
      'Every UK pre-workout ranked by caffeine per serving, with beta-alanine and citrulline doses and effectiveness scores.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: `Strongest Pre-Workouts UK ${YEAR}`,
    description: 'UK pre-workouts ranked by caffeine per serving, with beta-alanine and citrulline doses.',
  },
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
          name: `Strongest Pre-Workouts UK ${YEAR}`,
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
            'On caffeine per serving, the strongest UK pre-workouts sit at 350 to 500 mg, well above a standard 200 mg dose. Strongest is not the same as best: we rank every pre-workout by caffeine here, but each product also carries its Effectiveness Match score so you can see whether a high-stim formula is actually well dosed on beta-alanine and citrulline too.',
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
            'No. Beyond roughly 3 to 6 mg of caffeine per kg of bodyweight there is little extra performance benefit, just more jitters, higher heart rate and a harder crash. A great pre-workout also delivers a clinical dose of citrulline for pump and beta-alanine for muscular endurance. That is why our Effectiveness Match score, shown next to every product, rewards balanced dosing rather than raw stimulant load.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much beta-alanine and citrulline should a pre-workout have?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            `Evidence-based doses are about ${BETA_ALANINE_TARGET_G} g of beta-alanine for muscular endurance (the tingling is harmless) and ${CITRULLINE_TARGET_G} g or more of L-citrulline (or around 8 g of citrulline malate) for blood flow and pump. We list the beta-alanine and citrulline content of every pre-workout so you can check it is doing more than just caffeine.`,
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Strongest Pre-Workouts ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const row = (r: PreWorkoutRow, i: number) => {
    const highStim = r.caffeineMg > HIGH_STIM_MG
    const baHit = r.betaAlanineG != null && r.betaAlanineG >= BETA_ALANINE_TARGET_G
    const citHit = r.citrullineG != null && r.citrullineG >= CITRULLINE_TARGET_G
    const href = buyLink(r.brand, r.name, r.buy_url)
    return (
      <div
        key={r.id}
        className="bg-lab-panel border rounded-xl p-4"
        style={
          i === 0
            ? { borderColor: 'rgba(166,226,46,0.45)', boxShadow: '0 0 22px rgba(166,226,46,0.12)' }
            : { borderColor: '#262626' }
        }
      >
        <div className="flex items-center gap-4">
          <span className="text-xl shrink-0 w-6 text-center">
            {['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}
          </span>
          <ScoreBadge score={r.score} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/products/${r.id}`} className="hover:text-lab-lime transition-colors">
              <p className="text-white text-sm font-black leading-tight truncate">{r.brand}</p>
            </Link>
            <p className="text-lab-muted text-xs truncate">{r.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-lab-muted mt-1">
              {r.costPerServing != null ? `£${r.costPerServing.toFixed(2)}/serving` : 'Effectiveness Match score'}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p
              className="text-base font-black leading-none"
              style={{ color: highStim ? '#e05a2b' : '#a6e22e' }}
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
            {baHit ? ' ✓' : ''}
          </span>
          <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full bg-white/5 text-lab-muted border border-lab-border">
            Citrulline {citrullineLabel(r)}
            {citHit ? ' ✓' : ''}
          </span>
        </div>

        <div className={`grid ${href ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3`}>
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
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl"
              style={{
                background: 'rgba(166,226,46,0.12)',
                color: '#a6e22e',
                border: '1px solid rgba(166,226,46,0.5)',
              }}
            >
              Buy
            </a>
          )}
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
          dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
        />
      )}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
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
              Strongest Pre-Workouts {YEAR}
            </li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Caffeine Content Ranked · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Strongest Pre-Workouts <span className="text-lab-lime">UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Every UK pre-workout below is ranked by the number that decides how &ldquo;strong&rdquo; it
          feels: caffeine per serving. We also list the beta-alanine and citrulline dose, because a
          proper pre-workout does far more than just wire you.
        </p>
        <p className="text-lab-muted leading-relaxed mb-8">
          Each product carries its Effectiveness Match score, so you can see at a glance whether a
          high-caffeine formula is actually well built or just a stimulant hit. Strongest is not the
          same as best.
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
                Most caffeine per serving first. ✓ marks an evidence-based dose of that active.
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
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                We read the labelled caffeine, beta-alanine and citrulline content of every active UK
                pre-workout and rank by caffeine per serving. The Effectiveness Match score next to
                each product is our separate, evidence-based rating of the whole formula — dosing,
                stimulant balance and value — so you can weigh strength against quality. A ✓ means the
                product hits an evidence-based dose of that active ({BETA_ALANINE_TARGET_G} g
                beta-alanine, {CITRULLINE_TARGET_G} g citrulline).
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn a
                commission at no extra cost to you. This never affects scoring or rankings.
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
