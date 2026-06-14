import type { Metadata } from 'next'
import { Suspense } from 'react'
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
      <div className="max-w-2xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="text-lab-muted text-sm py-8 text-center">Loading…</div>}>
          <ProductGrid />
        </Suspense>
      </div>
    </div>
  )
}
