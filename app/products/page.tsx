import type { Metadata } from 'next'
import TopNav from '@/components/TopNav'
import ProductGrid from './ProductGrid'

export const metadata: Metadata = {
  title: 'Browse Supplements — The Lifting Lab',
  description:
    'Browse 200+ UK supplements ranked by clinical scoring. Filter by category, sort by rating, and compare effective dosing and true value.',
}

export default function ProductsPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-black uppercase tracking-wide">
            Browse <span className="text-lab-lime">Products</span>
          </h1>
          <p className="text-lab-muted text-sm mt-2">
            UK supplements ranked by effective dosing and clinical quality. Green ≥70, amber 50–69, red below 50.
          </p>
        </div>
        <ProductGrid />
      </div>
    </div>
  )
}
