import type { Metadata } from 'next'
import { Suspense } from 'react'
import TopNav from '@/components/TopNav'
import CompareView from './CompareView'

export const metadata: Metadata = {
  title: 'Compare Supplements — The Lifting Lab',
  description:
    'Head-to-head supplement comparison. See dosing side by side and get an evidence-based verdict on which product wins.',
}

export default function ComparePage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wide">
            Head-to-<span className="text-lab-lime">Head</span>
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            Side-by-side dosing and Effectiveness Match scores. Pick up to 3 products from the browser.
          </p>
          <p className="text-lab-muted/50 text-xs mt-1">
            Scores are for informational purposes only and do not constitute medical advice.
          </p>
        </div>
        <Suspense fallback={<p className="text-lab-muted text-sm">Loading…</p>}>
          <CompareView />
        </Suspense>
      </div>
    </div>
  )
}
