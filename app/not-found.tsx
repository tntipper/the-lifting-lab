import Link from 'next/link'
import TopNav from '@/components/TopNav'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-4xl mx-auto px-6 py-24 text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">404</p>
        <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight mb-4">
          Page not found
        </h1>
        <p className="text-lab-muted text-base max-w-sm mx-auto mb-10">
          That page doesn&apos;t exist. Try browsing products or building your stack.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/products"
            className="text-xs uppercase tracking-widest font-bold bg-lab-lime text-black px-6 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Browse products →
          </Link>
          <Link
            href="/"
            className="text-xs uppercase tracking-widest font-bold border border-lab-border text-white px-6 py-3 rounded-lg hover:border-lab-lime transition-colors"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  )
}
