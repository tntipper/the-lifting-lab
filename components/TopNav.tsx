import Link from 'next/link'

// Public top nav used across browse/compare pages.
export default function TopNav() {
  return (
    <header className="border-b border-lab-border sticky top-0 z-20 bg-lab-bg/90 backdrop-blur">
      <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link href="/products" className="font-black uppercase tracking-widest text-lg">
          THE LIFTING<span className="text-lab-lime">LAB</span>
        </Link>
        <nav className="flex items-center gap-5 text-xs font-bold uppercase tracking-widest">
          <Link href="/products" className="text-lab-muted hover:text-white transition-colors">
            Browse
          </Link>
          <Link href="/compare" className="text-lab-muted hover:text-white transition-colors">
            Compare
          </Link>
          <Link href="/guide" className="text-lab-muted hover:text-white transition-colors">
            Guides
          </Link>
          <Link
            href="/dashboard"
            className="text-lab-lime border border-lab-border rounded-lg px-3 py-1.5 hover:border-lab-lime transition-colors"
          >
            My Stack
          </Link>
        </nav>
      </div>
    </header>
  )
}
