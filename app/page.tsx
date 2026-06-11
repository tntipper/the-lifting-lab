import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  title: 'The Lifting Lab — Evidence-Based Supplement Scoring (UK)',
  description:
    'UK supplements ranked against clinical reference doses. Browse 200+ products by category, compare head-to-head, and build a safe, effective stack.',
}

const FEATURES = [
  {
    title: 'Clinical Scoring',
    body: 'Every product is scored 0–100 against a perfect clinical reference dose. No marketing, no proprietary-blend hiding. Just the numbers.',
    href: '/products',
    cta: 'Browse products',
  },
  {
    title: 'Head-to-Head',
    body: 'Line up to three products side by side. See the dose breakdown nutrient by nutrient and a clear verdict on which wins.',
    href: '/compare',
    cta: 'Compare now',
  },
  {
    title: 'Build Your Stack',
    body: 'Combine products into a stack and we flag the safety limits — caffeine, zinc, vitamin D and more — against EFSA upper limits.',
    href: '/dashboard',
    cta: 'My Stack',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />

      {/* hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-16 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-5">
          Evidence-Based Supplements · UK
        </p>
        <h1 className="text-4xl sm:text-6xl font-black uppercase tracking-tight leading-[0.95]">
          Stop guessing.
          <br />
          Start <span className="text-lab-lime">dosing.</span>
        </h1>
        <p className="text-lab-muted text-base sm:text-lg mt-6 max-w-xl mx-auto">
          We score the UK&apos;s biggest supplement brands against clinical reference
          doses, so you can see what actually works before you spend a penny.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 mt-9">
          <Link
            href="/products"
            className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Browse products →
          </Link>
          <Link
            href="/wizard"
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-white px-6 py-3 rounded-lg hover:border-lab-lime transition-colors"
          >
            Find my stack
          </Link>
        </div>
      </section>

      {/* features */}
      <section className="max-w-5xl mx-auto px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className="group bg-lab-panel border border-lab-border rounded-2xl p-6 hover:border-lab-lime transition-colors"
            >
              <h2 className="text-lg font-black uppercase tracking-wide mb-2">{f.title}</h2>
              <p className="text-lab-muted text-sm leading-relaxed mb-4">{f.body}</p>
              <span className="text-[11px] uppercase tracking-widest font-bold text-lab-lime group-hover:underline">
                {f.cta} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* how we score */}
      <section className="max-w-5xl mx-auto px-6 pb-24">
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-8">
          <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-lab-lime mb-3">
            How we score
          </p>
          <p className="text-lab-muted text-sm leading-relaxed max-w-3xl">
            Each product is measured as a percentage match against a mathematically
            defined clinical reference spec for its category. Pre-workouts are judged
            on core actives, with caffeine over 400mg heavily penalised. Protein is
            purity-weighted, and amino-spiking scores an automatic zero. Creatine is
            ranked on price-to-purity with a bonus for Creapure. Proprietary blends
            trigger severe deductions across the board.
          </p>
          <div className="flex flex-wrap gap-3 mt-6 text-[11px] uppercase tracking-widest font-bold">
            <span className="px-3 py-1.5 rounded-full bg-lab-lime/10 text-lab-lime border border-lab-lime/30">
              Green ≥ 70
            </span>
            <span className="px-3 py-1.5 rounded-full bg-lab-amber/10 text-lab-amber border border-lab-amber/30">
              Amber 50–69
            </span>
            <span className="px-3 py-1.5 rounded-full bg-lab-red/10 text-lab-red border border-lab-red/30">
              Red &lt; 50
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-lab-border">
        <div className="max-w-5xl mx-auto px-6 py-8 text-center text-lab-muted text-xs">
          The Lifting Lab · Evidence-based supplement scoring · UK
        </div>
      </footer>
    </div>
  )
}
