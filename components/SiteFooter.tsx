import Link from 'next/link'

const SHOP = [
  ['/products', 'Shop all'], ['/products?group=protein', 'Protein'], ['/products?category=creatine', 'Creatine'],
  ['/products?category=pre-workout', 'Pre-workout'], ['/products?category=hydration', 'Hydration'], ['/products?category=protein-bar', 'Bars'],
] as const

const RESEARCH = [
  ['/sources', 'Research sources'], ['/methodology', 'How we assess'], ['/ingredients', 'Ingredients'],
  ['/compare', 'Compare'], ['/stack', 'Stack builder'], ['/calculators', 'Calculators'],
] as const

export default function SiteFooter() {
  return <footer className="tll-on-dark mt-auto border-t border-[#2a2c26] bg-[#0d0d0d] text-white">
    <div className="mx-auto grid max-w-[1200px] gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-[1.2fr_.8fr_.8fr_1.2fr]">
      <div>
        <img src="/brand/tll-lockup.png" alt="The Lifting Lab" className="h-24 w-auto max-w-full object-contain object-left" />
        <p className="mt-4 max-w-sm text-sm leading-5 text-[#a9ac9f]">Compare recorded doses, evidence sources and listed UK prices, then organise everything in one stack.</p>
      </div>
      <nav aria-label="Shop links"><h2 className="text-xs font-semibold uppercase tracking-[.08em] text-[#a9ac9f]">Shop</h2><ul className="mt-3 grid gap-1">{SHOP.map(([href, label]) => <li key={href}><Link href={href} className="inline-flex min-h-11 items-center text-sm text-white hover:underline">{label}</Link></li>)}</ul></nav>
      <nav aria-label="Research links"><h2 className="text-xs font-semibold uppercase tracking-[.08em] text-[#a9ac9f]">Research</h2><ul className="mt-3 grid gap-1">{RESEARCH.map(([href, label]) => <li key={href}><Link href={href} className="inline-flex min-h-11 items-center text-sm text-white hover:underline">{label}</Link></li>)}</ul></nav>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[.08em] text-[#a9ac9f]">Keep up with the lab</h2>
        <p className="mt-3 text-sm leading-5 text-[#a9ac9f]">Questions, product submissions, new research and future shop updates.</p>
        <Link href="/contact" className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-lg bg-lab-lime px-5 text-sm font-semibold text-black">Contact The Lifting Lab</Link>
        <div className="mt-5 flex flex-wrap gap-2" aria-label="Follow us">
          <a href="https://www.instagram.com/dadthletelab" target="_blank" rel="noopener" aria-label="Instagram" className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63]"><img src="/social/instagram.svg" alt="" className="h-5 w-5 invert" /></a>
          <a href="https://www.tiktok.com/@dadthletelab" target="_blank" rel="noopener" aria-label="TikTok" className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63]"><img src="/social/tiktok.svg" alt="" className="h-5 w-5 invert" /></a>
        </div>
      </div>
    </div>
    <div className="border-t border-[#2a2c26]"><div className="mx-auto flex max-w-[1200px] flex-col gap-4 px-4 py-5 text-xs leading-5 text-[#a9ac9f] sm:flex-row sm:items-end sm:justify-between"><p className="max-w-3xl">Prices are recorded from UK retailers and may change. Dose ranges cite ISSN, NHS and EFSA sources where available. Informational only, not medical advice.</p><nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-2"><Link href="/privacy" className="text-[#a9ac9f] hover:text-white">Privacy</Link><Link href="/terms" className="text-[#a9ac9f] hover:text-white">Terms</Link><Link href="/affiliate-disclosure" className="text-[#a9ac9f] hover:text-white">Affiliate disclosure</Link></nav></div></div>
  </footer>
}
