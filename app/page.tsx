import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CategoryGrid from '@/components/CategoryGrid'
import FeaturedSlot from '@/components/FeaturedSlot'

export const metadata: Metadata = {
  title: 'The Lifting Lab — Evidence-Based Supplement Scoring (UK)',
  description:
    'UK supplements ranked against evidence-based reference doses. Browse 200+ products by category, compare head-to-head, and build a safe, effective stack.',
  alternates: { canonical: 'https://theliftinglab.co.uk' },
}

const SITE = 'https://theliftinglab.co.uk'

// Root brand-entity structured data. Product/guide pages already emit per-page
// schema, but the site had no Organization (brand entity + social profiles) or
// WebSite node — the foundation Google uses to understand the whole domain and
// to surface a sitelinks search box. The SearchAction target is a real, working
// URL now that /products reads ?q= (see ProductGrid).
const orgLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'The Lifting Lab',
  url: SITE,
  logo: `${SITE}/opengraph-image`,
  description:
    'Evidence-based UK supplement scoring. Products ranked against clinical reference doses for effectiveness and true cost per serving.',
  sameAs: [
    'https://www.tiktok.com/@dadthletelab',
    'https://www.instagram.com/dadthletelab',
  ],
}

const websiteLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  '@id': `${SITE}/#website`,
  name: 'The Lifting Lab',
  url: SITE,
  publisher: { '@id': `${SITE}/#organization` },
  potentialAction: {
    '@type': 'SearchAction',
    target: {
      '@type': 'EntryPoint',
      urlTemplate: `${SITE}/products?q={search_term_string}`,
    },
    'query-input': 'required name=search_term_string',
  },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteLd) }}
      />
      <TopNav />

      <div className="max-w-[860px] mx-auto px-4 pt-6 pb-20 space-y-5">
        {/* wordmark */}
        <div className="text-center pt-2 pb-1 relative">
          {/* ambient glow */}
          <div
            className="pointer-events-none absolute top-[-20px] left-1/2 -translate-x-1/2 w-64 h-24 opacity-60"
            style={{
              background: 'radial-gradient(ellipse at center, rgba(166,226,46,0.12) 0%, transparent 70%)',
              filter: 'blur(18px)',
            }}
          />
          <h1
            className="relative text-[38px] uppercase leading-none tracking-tight"
            style={{ fontFamily: 'var(--font-anton), Impact, sans-serif', transform: 'skewX(-4deg)' }}
          >
            The Lifting{' '}
            <span
              style={{
                color: '#a6e22e',
                textShadow: '0 0 14px rgba(166,226,46,0.5)',
              }}
            >
              Lab
            </span>
          </h1>
          <p className="relative text-[13px] uppercase tracking-[0.2em] font-bold text-lab-muted mt-2">
            Evidence-Based Supplement Comparisons · UK
          </p>
        </div>

        {/* Find My Stack — hero CTA */}
        <div className="relative">
          <div className="lab-cta-bloom" />
          <Link
            href="/wizard"
            className="lab-cta relative flex items-center gap-4 w-full rounded-2xl px-5 py-4 hover:opacity-90 transition-opacity"
          >
            <span className="text-2xl">🧪</span>
            <div className="min-w-0 flex-1">
              <p
                className="uppercase tracking-wide text-[15px] leading-none font-black"
                style={{ fontFamily: 'var(--font-anton), Impact, sans-serif' }}
              >
                Find My Stack
              </p>
              <p className="text-[11px] font-bold mt-1 opacity-70">Answer 5 quick questions</p>
            </div>
            <span className="text-xl font-black">→</span>
          </Link>
        </div>

        {/* featured brand slot */}
        <FeaturedSlot />

        {/* section label */}
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted pt-1">
          Browse by Category
        </p>

        {/* category tiles */}
        <CategoryGrid />

        {/* action buttons */}
        <div className="space-y-2 pt-1">
          <Link
            href="/submit"
            className="flex items-center gap-3 w-full bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime/40 transition-colors"
          >
            <span className="text-lg font-bold text-white/60">+</span>
            <span className="text-sm font-bold text-white">Missing a supplement?</span>
            <span className="ml-auto text-lab-lime text-sm font-bold">→</span>
          </Link>

          <Link
            href="/contact"
            className="flex items-center gap-3 w-full bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime/40 transition-colors"
          >
            <span className="text-lg">✉️</span>
            <span className="text-sm font-bold text-white">Contact Us</span>
            <span className="ml-auto text-lab-lime text-sm font-bold">→</span>
          </Link>
        </div>

        {/* how we score strip */}
        <div className="bg-lab-panel border border-lab-border rounded-xl px-4 py-4 space-y-2">
          <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted">How we score</p>
          <p className="text-xs text-white/60 leading-relaxed">
            Effectiveness Match (0–100) vs evidence-based dosing standards.
            True Cost = price per full effective serving. Informational only — not medical advice.
          </p>
          <div className="flex gap-3 pt-1 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lab-lime/10 text-lab-lime border border-lab-lime/30">Green ≥ 70</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">Amber 50–69</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">Red &lt; 50</span>
          </div>
        </div>

        {/* footer */}
        <div className="text-center text-[10px] text-lab-muted space-y-1 pt-2">
          <p>The Lifting Lab · Evidence-based supplement scoring · UK</p>
          <p className="flex flex-wrap justify-center gap-x-4">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <Link href="/affiliate-disclosure" className="hover:text-white">Affiliate Disclosure</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
