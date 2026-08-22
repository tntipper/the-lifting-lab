import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import ScoreBadge from '@/components/ScoreBadge'
import { categoryLabel } from '@/lib/categories'
import { GUIDE_SLUGS } from '@/lib/guides'
import { buyLink } from '@/lib/affiliate'
import {
  fetchProteinValueRows,
  fmtPerGram,
  PROTEIN_CATEGORIES,
  type ProteinValueRow,
} from '@/lib/protein-value'

// SSG with a daily refresh so price/serving updates flow into the per-gram
// rankings without a redeploy.
export const revalidate = 86400

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/protein-value`
const YEAR = 2026

export const metadata: Metadata = {
  title: 'Cheapest Protein Powder Per Gram UK 2026 — Cost Per Gram of Protein',
  description:
    'UK protein powders ranked by the metric that actually matters: cost per gram of protein, not price per tub. See the cheapest whey, isolate and casein per gram of real protein, with effectiveness scores.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Cheapest Protein Powder Per Gram UK 2026 — Cost Per Gram of Protein',
    description:
      'Every UK protein powder ranked by true cost per gram of protein. The cheapest whey, isolate and casein that still score well.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Cheapest Protein Powder Per Gram UK 2026',
    description: 'UK protein powders ranked by true cost per gram of protein.',
  },
}

function fmtDose(n: number) {
  return `£${n.toFixed(2)}`
}

export default async function ProteinValuePage() {
  const rows = await fetchProteinValueRows()

  const overall = rows.slice(0, 10)

  // Per-type sections, each fully ranked cheapest-per-gram first.
  const sections = PROTEIN_CATEGORIES.map((slug) => ({
    slug,
    items: rows.filter((r) => r.category === slug),
  })).filter((s) => s.items.length > 0)

  const itemListJsonLd =
    overall.length > 0
      ? {
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: `Cheapest Protein Powder Per Gram UK ${YEAR}`,
          description: `UK protein powders ranked by cost per gram of protein for ${YEAR}.`,
          itemListOrder: 'https://schema.org/ItemListOrderAscending',
          numberOfItems: overall.length,
          itemListElement: overall.map((r, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            item: {
              '@type': 'Product',
              name: r.name,
              brand: { '@type': 'Brand', name: r.brand },
              category: categoryLabel(r.category),
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
        name: 'How is cost per gram of protein calculated?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'We take the protein per serving (serving size multiplied by the protein content by weight), multiply by the number of servings in the tub to get the total grams of protein, then divide the retail price by that total. The result is the true price of one gram of protein, which is the fairest way to compare powders of different sizes and protein percentages.',
        },
      },
      {
        '@type': 'Question',
        name: 'Is the cheapest protein powder per gram always the best buy?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Cost per gram of protein is the best single value metric, but it is not the whole story. We show the Effectiveness Match score alongside every price so you can see whether a cheap powder is also well formulated. A concentrate is usually the cheapest per gram; a whey isolate costs more but is leaner and lower in lactose, which can be worth it for some people.',
        },
      },
      {
        '@type': 'Question',
        name: 'How much protein is in one serving of whey?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Most whey concentrates deliver around 20 to 25 grams of protein per 30 gram scoop, while whey isolates are more concentrated and often reach 24 to 27 grams from a slightly smaller scoop. We list the exact grams of protein per serving for every product so you are comparing like for like.',
        },
      },
      {
        '@type': 'Question',
        name: 'Why is whey concentrate cheaper per gram than isolate?',
        acceptedAnswer: {
          '@type': 'Answer',
          text:
            'Isolate goes through extra filtering to strip out fat and lactose and raise the protein percentage, which costs more to produce. Concentrate keeps more of the natural milk fraction, so it is cheaper per gram of protein while still being an excellent, complete protein source for most people.',
        },
      },
    ],
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: `Cheapest Protein Per Gram ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  const row = (r: ProteinValueRow, i: number, showRank: boolean) => {
    const hasGuide = GUIDE_SLUGS.includes(r.category)
    const href = buyLink(r.brand, r.name, r.buy_url)
    return (
      <div
        key={r.id}
        className="bg-lab-panel border rounded-xl p-4"
        style={
          showRank && i === 0
            ? { borderColor: 'rgba(166,226,46,0.45)', boxShadow: '0 0 22px rgba(166,226,46,0.12)' }
            : { borderColor: '#262626' }
        }
      >
        <div className="flex items-center gap-4">
          {showRank && (
            <span className="text-xl shrink-0 w-6 text-center">
              {['🥇', '🥈', '🥉'][i] ?? `#${i + 1}`}
            </span>
          )}
          <ScoreBadge score={r.score} size="sm" />
          <div className="min-w-0 flex-1">
            <Link href={`/products/${r.id}`} className="hover:text-lab-lime transition-colors">
              <p className="text-white text-sm font-black leading-tight truncate">{r.brand}</p>
            </Link>
            <p className="text-lab-muted text-xs truncate">{r.name}</p>
            <p className="text-[10px] uppercase tracking-widest text-lab-muted mt-1">
              {r.proteinPerServing}g protein/serving · {fmtDose(r.costPer30g)}/30g
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lab-lime text-base font-black leading-none">{fmtPerGram(r.costPerGram)}</p>
            <p className="text-[9px] uppercase tracking-widest text-lab-muted mt-1">per g protein</p>
          </div>
        </div>
        <div className={`grid ${href ? 'grid-cols-3' : 'grid-cols-2'} gap-2 mt-3`}>
          <Link
            href={`/products/${r.id}`}
            className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
          >
            Details
          </Link>
          {hasGuide ? (
            <Link
              href={`/guide/${r.category}`}
              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
            >
              Guide
            </Link>
          ) : (
            <Link
              href={`/products?category=${r.category}`}
              className="text-center text-[10px] font-black uppercase tracking-widest py-2.5 rounded-xl border border-lab-border text-lab-muted hover:text-white transition-colors"
            >
              See all
            </Link>
          )}
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
              Cheapest Protein Per Gram {YEAR}
            </li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Cost Per Gram of Protein · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Cheapest Protein Powder <span className="text-lab-lime">Per Gram UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          Price per tub tells you almost nothing. A big cheap tub can cost more per gram of protein
          than a smaller premium one. We rank every UK protein powder by the metric that actually
          matters: the true cost of one gram of protein.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          For each product we work out the grams of protein per serving, multiply by the servings in
          the tub, and divide the price by the total protein. Every powder also carries its
          Effectiveness Match score, so you can see whether the cheapest per gram is also well
          formulated. Rankings recalculate as prices change.
        </p>

        {rows.length === 0 ? (
          <div className="text-center py-16 text-lab-muted">
            <p className="text-4xl mb-3">🥛</p>
            <p className="text-sm">Protein value rankings are being tallied. Check back shortly.</p>
          </div>
        ) : (
          <>
            {/* Overall leaderboard — cheapest per gram across all protein types */}
            {overall.length > 0 && (
              <section className="mb-14">
                <h2 className="text-xl font-black uppercase tracking-wide mb-1">
                  Cheapest <span className="text-lab-lime">Per Gram</span>
                </h2>
                <p className="text-lab-muted text-sm mb-5">
                  The lowest cost-per-gram-of-protein picks across whey, isolate and casein.
                </p>
                <div className="space-y-3">{overall.map((r, i) => row(r, i, true))}</div>
              </section>
            )}

            {/* Per-type sections */}
            {sections.map(({ slug, items }) => (
              <section key={slug} className="mb-12">
                <h2 className="text-lg font-black uppercase tracking-wide mb-1">
                  {categoryLabel(slug)}
                </h2>
                <p className="text-lab-muted text-xs uppercase tracking-widest mb-4">
                  Ranked by cost per gram of protein
                </p>
                <div className="space-y-3">{items.map((r, i) => row(r, i, false))}</div>
              </section>
            ))}

            {/* methodology + funnel */}
            <section className="mt-14 bg-lab-panel border border-lab-border rounded-2xl p-6">
              <h2 className="text-lg font-black uppercase tracking-wide mb-3">
                How cost per gram is worked out
              </h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-3">
                Protein per serving is the serving size multiplied by the protein content by weight.
                Multiply that by the servings in the tub for the total grams of protein, then divide
                the price by that total. The result is the real price of one gram of protein, the
                fairest way to compare powders of different sizes and protein percentages. A whey
                concentrate is usually cheapest per gram; a whey isolate costs a little more but is
                leaner and lower in lactose.
              </p>
              <p className="text-lab-muted/70 text-xs leading-relaxed mb-5">
                Informational only — not medical advice. Buy links are affiliate links; we may earn a
                commission at no extra cost to you. This never affects scoring or rankings.
              </p>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/value"
                  className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
                >
                  Best value overall →
                </Link>
                <Link
                  href="/guide/whey"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Whey guide
                </Link>
                <Link
                  href="/best/whey"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Best whey
                </Link>
                <Link
                  href="/products?category=whey"
                  className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
                >
                  Browse protein
                </Link>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  )
}
