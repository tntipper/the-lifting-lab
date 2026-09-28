import Link from 'next/link'

export default function SiteFooter() {
  return (
    <footer className="tll-on-dark tll-dark-section mt-auto border-t border-[#2a2c26]">
      <div className="mx-auto grid max-w-7xl gap-8 px-5 py-10 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="tll-display text-3xl text-white">The Lifting <span className="text-[#a6e22e]">Lab</span></p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-[#a9ac9f]">
            Independent UK supplement research, label comparisons and listed prices. Informational only, not medical advice.
          </p>
        </div>
        <nav aria-label="Footer navigation" className="flex flex-wrap gap-x-5 gap-y-3 text-sm text-[#a9ac9f]">
          <Link href="/faq" className="hover:text-white">Answers</Link>
          <Link href="/contact" className="hover:text-white">Contact</Link>
          <Link href="/privacy" className="hover:text-white">Privacy</Link>
          <Link href="/terms" className="hover:text-white">Terms</Link>
          <Link href="/affiliate-disclosure" className="hover:text-white">Affiliate disclosure</Link>
        </nav>
      </div>
    </footer>
  )
}
