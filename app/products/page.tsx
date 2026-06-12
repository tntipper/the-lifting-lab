import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import ProductGrid from './ProductGrid'
import MethodologyModal from '@/components/MethodologyModal'

export const metadata: Metadata = {
  title: 'Browse Supplements — The Lifting Lab',
  description:
    'Browse 200+ UK supplements ranked by clinical scoring. Filter by category, sort by rating, and compare effective dosing and true value.',
}

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black uppercase italic">
              Supplement <span className="text-lab-lime">Showdown</span>
            </h1>
            <p className="text-lab-muted text-xs mt-1">
              Ranked by effective dosing · not brand reputation
            </p>
          </div>
          <MethodologyModal />
        </div>
        <ProductGrid />
      </div>
    </div>
  )
}
