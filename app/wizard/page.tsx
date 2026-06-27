import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { STACK_GUIDES } from '@/lib/stacks'
import Wizard from './Wizard'

export const metadata: Metadata = {
  title: 'Find My Stack — The Lifting Lab',
  description:
    'Answer four quick questions and get a personalised supplement stack, built from the highest-scored UK products for your goal and budget.',
}

export default function WizardPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-2xl mx-auto px-6 py-12">
        <div className="mb-8 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-2">
            Find My Stack
          </p>
          <h1 className="text-3xl font-black uppercase tracking-tight">
            Build your <span className="text-lab-lime">stack</span> in 4 steps
          </h1>
        </div>
        <Wizard />

        {/* Ready-made stacks — static cross-links for visitors who would rather
            grab a proven stack than answer questions (and crawlable internal
            links from this nav-level page to every /stacks goal page). */}
        <section className="mt-14 pt-8 border-t border-lab-border">
          <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-2 text-center">
            Or grab a ready-made stack
          </p>
          <p className="text-lab-muted text-sm text-center mb-6">
            Proven stacks for the most common goals, built from the top-scoring UK products.
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {STACK_GUIDES.map((s) => (
              <Link
                key={s.slug}
                href={`/stacks/${s.slug}`}
                className="text-xs uppercase tracking-widest font-bold border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 px-4 py-2 rounded-lg transition-colors"
              >
                {s.eyebrow.replace(/^Goal · /, '')}
              </Link>
            ))}
          </div>
          <div className="text-center mt-6">
            <Link
              href="/stacks"
              className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white"
            >
              See all stacks →
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}
