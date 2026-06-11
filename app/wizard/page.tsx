import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
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
      </div>
    </div>
  )
}
