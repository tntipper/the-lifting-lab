import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import CategoryGrid from '@/components/CategoryGrid'
import FeaturedSlot from '@/components/FeaturedSlot'

export const metadata: Metadata = {
  title: 'The Lifting Lab — Evidence-Based Supplement Scoring (UK)',
  description:
    'UK supplements ranked against clinical reference doses. Browse 200+ products by category, compare head-to-head, and build a safe, effective stack.',
  alternates: { canonical: 'https://theliftinglab.co.uk' },
}

export default function Home() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />

      <div className="max-w-lg mx-auto px-4 pt-6 pb-20 space-y-5">
        {/* wordmark + tagline */}
        <div className="text-center pt-2 pb-1">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-lab-muted mb-1">
            Evidence-Based Supplements · UK
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight leading-none">
            The Lifting Lab
          </h1>
        </div>

        {/* Find My Stack — hero CTA */}
        <Link
          href="/wizard"
          className="flex items-center gap-4 w-full bg-lab-lime text-black rounded-2xl px-5 py-4 hover:opacity-90 transition-opacity"
        >
          <span className="text-2xl">🧪</span>
          <div className="min-w-0 flex-1">
            <p className="font-black uppercase tracking-wide text-base leading-none">Find My Stack</p>
            <p className="text-[11px] font-bold mt-0.5 opacity-70">Answer 5 quick questions</p>
          </div>
          <span className="text-xl font-black">→</span>
        </Link>

        {/* featured brand slot */}
        <FeaturedSlot />

        {/* category tiles */}
        <CategoryGrid />

        {/* action buttons */}
        <Link
          href="/guide"
          className="flex items-center gap-3 w-full bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime transition-colors"
        >
          <span className="text-lg">📖</span>
          <span className="text-sm font-bold text-white">Supplement Guide</span>
          <span className="ml-auto text-lab-lime text-sm font-bold">→</span>
        </Link>

        <Link
          href="/submit"
          className="flex items-center gap-3 w-full bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime transition-colors"
        >
          <span className="text-lg">+</span>
          <span className="text-sm font-bold text-white">Missing a supplement?</span>
          <span className="ml-auto text-lab-lime text-sm font-bold">→</span>
        </Link>

        <Link
          href="/contact"
          className="flex items-center gap-3 w-full bg-lab-panel border border-lab-border rounded-xl px-4 py-3.5 hover:border-lab-lime transition-colors"
        >
          <span className="text-lg">✉️</span>
          <span className="text-sm font-bold text-white">Contact Us</span>
          <span className="ml-auto text-lab-lime text-sm font-bold">→</span>
        </Link>

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
