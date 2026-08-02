import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import GlossaryTracker from './GlossaryTracker'
import { GLOSSARY, glossaryTermCount } from '@/lib/glossary'

const SITE = 'https://www.theliftinglab.co.uk'
const URL = `${SITE}/glossary`

const TERM_COUNT = glossaryTermCount()

export const metadata: Metadata = {
  title: 'Supplement Label Glossary — Jargon & Trick Decoder UK 2026 | The Lifting Lab',
  description:
    'Plain-English definitions of every supplement label term and trick — proprietary blends, amino spiking, fairy dusting, clinical dose, whey isolate, DIAAS, Informed Sport and more. Decode the tub before you buy.',
  alternates: { canonical: URL },
  openGraph: {
    title: 'Supplement Label Glossary | The Lifting Lab',
    description:
      'Decode the tub: every label term and trick explained in plain English, with what each one really means for your money.',
    url: URL,
    type: 'website',
    siteName: 'The Lifting Lab',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Supplement Label Glossary | The Lifting Lab',
    description:
      'Proprietary blends, amino spiking, fairy dusting, DIAAS, Informed Sport — every supplement term decoded.',
  },
}

export default function GlossaryPage() {
  // DefinedTermSet schema — Google's structured type for a glossary. Every term
  // below is rendered visibly on the page, so the markup is backed 1:1 by content.
  const definedTermSetJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'DefinedTermSet',
    name: 'The Lifting Lab Supplement Glossary',
    description:
      'Definitions of supplement label terms, dosing concepts, protein science, ingredient forms and quality certifications.',
    url: URL,
    hasDefinedTerm: GLOSSARY.flatMap((g) =>
      g.terms.map((t) => ({
        '@type': 'DefinedTerm',
        '@id': `${URL}#${t.id}`,
        name: t.term,
        description: t.def,
        inDefinedTermSet: URL,
        url: `${URL}#${t.id}`,
      }))
    ),
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { name: 'Home', item: SITE },
      { name: 'Glossary', item: URL },
    ].map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
  }

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <GlossaryTracker />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(definedTermSetJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* breadcrumb */}
        <nav aria-label="Breadcrumb" className="mb-4 text-xs text-lab-muted">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li><Link href="/" className="hover:text-white">Home</Link></li>
            <li aria-hidden className="text-lab-border">/</li>
            <li aria-current="page" className="text-white/80">Glossary</li>
          </ol>
        </nav>

        {/* hero */}
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">
          The Lifting Lab · Label Decoder
        </p>
        <h1 className="text-3xl sm:text-4xl font-black uppercase tracking-tight mb-3">
          Supplement <span className="text-lab-lime">label</span> glossary
        </h1>
        <p className="text-lab-muted max-w-2xl mb-6">
          {TERM_COUNT} supplement terms and label tricks, decoded in plain English. The
          front of the tub is marketing; this is the vocabulary you need to read the back and
          work out whether you are paying for actives or for adjectives.
        </p>
        <p className="text-sm text-lab-muted mb-10">
          Want the numbers behind it?{' '}
          <Link href="/methodology" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Our scoring method
          </Link>{' '}
          ·{' '}
          <Link href="/watch-outs" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Products we flag
          </Link>{' '}
          ·{' '}
          <Link href="/ingredients" className="text-lab-lime font-bold hover:underline underline-offset-2">
            Ingredient library
          </Link>
        </p>

        {/* Table of contents — jump links */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 mb-12">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            Jump to a section
          </p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {GLOSSARY.map((g) => (
              <li key={g.key}>
                <a
                  href={`#${g.key}`}
                  className="text-sm font-bold text-white/80 hover:text-lab-lime transition-colors"
                >
                  {g.title}
                  <span className="text-lab-muted font-normal"> ({g.terms.length})</span>
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-14">
          {GLOSSARY.map((g) => (
            <section key={g.key} id={g.key} className="scroll-mt-24">
              <h2 className="text-2xl font-black uppercase tracking-tight mb-1.5">{g.title}</h2>
              <p className="text-sm text-lab-muted mb-6 max-w-2xl">{g.blurb}</p>

              <div className="space-y-4">
                {g.terms.map((t) => (
                  <div
                    key={t.id}
                    id={t.id}
                    className="bg-lab-panel border border-lab-border rounded-2xl p-6 scroll-mt-24"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
                      <h3 className="text-base font-black text-white">{t.term}</h3>
                      {t.aka && t.aka.length > 0 && (
                        <span className="text-[11px] text-lab-muted">
                          aka {t.aka.join(', ')}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-white/90 font-semibold leading-relaxed mb-2">
                      {t.def}
                    </p>
                    <p className="text-sm text-white/65 leading-relaxed mb-3">{t.why}</p>
                    <Link
                      href={t.link.href}
                      className="inline-block text-[11px] uppercase tracking-widest font-bold text-lab-lime hover:underline underline-offset-2"
                    >
                      {t.link.label} →
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        {/* Funnel out to the money surfaces */}
        <div className="mt-16 bg-lab-panel border border-lab-border rounded-2xl p-6">
          <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            Now put it to work
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/best" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Best Supplements 2026 →</Link>
            <Link href="/value" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Best Value →</Link>
            <Link href="/watch-outs" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Watch-Outs →</Link>
            <Link href="/wizard" className="text-sm font-bold text-lab-lime hover:underline underline-offset-2">Find My Stack →</Link>
          </div>
        </div>

        <p className="text-lab-muted/70 text-xs mt-10 leading-relaxed max-w-2xl">
          Definitions are educational and reflect The Lifting Lab’s evidence-based, editorial view
          of the supplement market. They are not medical advice. Always check the current product
          label, and consult a qualified clinician before starting a supplement if you take
          medication, have a health condition, or are pregnant.
        </p>
      </div>
    </div>
  )
}
