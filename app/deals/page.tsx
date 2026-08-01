import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import DealsBoard from './DealsBoard'

// Fully static, DB-free surface — the code and partner links come from local
// affiliate config only, so this page can never fail at runtime. Targets the
// highest commercial-intent query class we had no home for ("MyProtein discount
// code", "supplement deals UK") and funnels code-hunters into our value pages.

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/deals`
const YEAR = 2026

export const metadata: Metadata = {
  title: 'Supplement Discount Codes & Deals UK 2026 — MyProtein Code + Verified Offers',
  description:
    'A verified MyProtein refer-a-friend discount code plus the current deals from the UK supplement brands we actually partner with. We only publish codes we can stand behind, and show you the smarter way to save: cost per effective serving.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Discount Codes & Deals UK 2026',
    description:
      'A verified MyProtein code plus live offers from our partner brands, and the honest way to actually save on supplements.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Discount Codes & Deals UK 2026',
    description: 'A verified MyProtein code, live partner offers, and the smarter way to save.',
  },
}

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Do you have a MyProtein discount code?',
    a: 'Yes. Our MyProtein refer-a-friend code is TOBIAS-R1I5. It applies MyProtein’s current new-customer refer-a-friend discount at checkout. You can copy it from this page, or use our Shop link which adds it automatically.',
  },
  {
    q: 'How do I use the code?',
    a: 'Either paste TOBIAS-R1I5 into the promo or referral box at the MyProtein checkout, or click our Shop MyProtein link, which appends the code to the URL so it is applied for you while keeping your basket.',
  },
  {
    q: 'Are these codes verified?',
    a: 'We only publish a code we can actually stand behind. The MyProtein code is our own refer-a-friend link, so we know it is live. For other brands we link to the retailer’s own current sale and offers pages rather than posting expired or fake codes, which is what most discount-code sites are full of.',
  },
  {
    q: 'Why don’t you list a code for every brand?',
    a: 'Because most supplement discount codes online are dead, exclusive to one retailer, or invented for clicks. We would rather show one working code and honest links to live sales than pad the page with codes that do not work.',
  },
  {
    q: 'Is a discount code the best way to save on supplements?',
    a: 'Usually not. The biggest lever is cost per effective serving, not the headline discount. A cheap, heavily discounted tub that is under-dosed still is not value. Use our Best Value and Cheapest Per Serving pages to find products that are genuinely cheap for a dose that works, then stack a code on top.',
  },
]

export default function DealsPage() {
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
      { name: `Discount Codes & Deals ${YEAR}`, item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
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
              Discount Codes &amp; Deals {YEAR}
            </li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          Verified Codes &amp; Live Offers · {YEAR}
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight leading-tight mb-6">
          Supplement Discount Codes <span className="text-lab-lime">&amp; Deals UK {YEAR}</span>
        </h1>
        <p className="text-lg text-white/90 leading-relaxed mb-4">
          One code we can actually stand behind, live offers from the brands we genuinely partner
          with, and the honest bit most discount-code sites skip: chasing codes is rarely how you
          save the most on supplements.
        </p>
        <p className="text-lab-muted leading-relaxed mb-10">
          No walls of dead or invented codes. Just a working MyProtein referral discount, current
          partner sales, and a fast route to the products that are cheap for a dose that actually
          works.
        </p>

        {/* interactive: verified code + partner retailers */}
        <DealsBoard />

        {/* the honest truth block — the real funnel into value pages */}
        <section className="mb-12 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <h2 className="text-lg font-black uppercase tracking-wide mb-3">
            The honest way to <span className="text-lab-lime">actually save</span>
          </h2>
          <p className="text-lab-muted text-sm leading-relaxed mb-3">
            A discount code trims the sticker price. It does nothing about the number that decides
            what a supplement really costs you: the price of a single{' '}
            <span className="text-white/80">effective</span> serving. A £30 tub at 30% off is no
            bargain if it is under-dosed, uses a proprietary blend, or amino-spikes its protein — you
            are just paying less for something that still does not work.
          </p>
          <p className="text-lab-muted text-sm leading-relaxed mb-5">
            So do it in this order: pick a product that clears our evidence-based dosing bar, sort by
            cost per serving, then stack a code on top of the winner. That way the discount lands on
            something worth buying.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/value"
              className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-5 py-2.5 rounded-lg hover:opacity-90"
            >
              Best value (per pound) →
            </Link>
            <Link
              href="/cheapest"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Cheapest per serving
            </Link>
            <Link
              href="/protein-value"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Protein £/gram
            </Link>
            <Link
              href="/best"
              className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-white px-5 py-2.5 rounded-lg transition-colors"
            >
              Best by score
            </Link>
          </div>
        </section>

        {/* FAQ — backed 1:1 by the FAQPage JSON-LD above */}
        <section className="mb-12">
          <h2 className="text-lg font-black uppercase tracking-wide mb-5">Discount code FAQs</h2>
          <div className="space-y-4">
            {FAQS.map((f) => (
              <div key={f.q} className="bg-lab-panel border border-lab-border rounded-xl p-5">
                <h3 className="text-sm font-black text-white mb-2">{f.q}</h3>
                <p className="text-lab-muted text-sm leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="text-lab-muted/70 text-xs leading-relaxed">
          Informational only — not medical advice. Discount availability and amounts are set by the
          retailers and can change at any time. Buy and shop links are affiliate links; we may earn a
          commission or referral credit at no extra cost to you. This never affects our scoring or
          rankings.
        </p>
      </main>
    </div>
  )
}
