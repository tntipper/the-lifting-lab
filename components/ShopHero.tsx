import Link from 'next/link'
import type { ScoredProduct } from '@/lib/products'

const GROUPS = [
  { label: 'Creatine', categories: ['creatine'] },
  { label: 'Whey protein', categories: ['whey', 'whey-isolate'] },
  { label: 'Pre-workout', categories: ['pre-workout'] },
]

function lowestListed(products: ScoredProduct[], categories: string[]) {
  return products
    .filter((product) => categories.includes(product.category)
      && typeof product.cost_per_serving === 'number'
      && Number.isFinite(product.cost_per_serving)
      && product.cost_per_serving > 0)
    .sort((a, b) => (a.cost_per_serving ?? Infinity) - (b.cost_per_serving ?? Infinity))[0] ?? null
}

export default function ShopHero({ products, shopHref = '#shop-products' }: { products: ScoredProduct[]; shopHref?: string }) {
  return <section className="tll-on-dark border-b border-[#2a2c26] bg-[#0d0d0d] text-white">
    <div className="mx-auto grid min-h-[520px] max-w-[1920px] gap-9 px-5 py-12 sm:px-8 lg:grid-cols-[1fr_.96fr] lg:items-center lg:gap-14 lg:px-11 lg:py-16 xl:min-h-[584px]">
      <div className="max-w-[860px]">
        <p className="text-sm font-black uppercase tracking-[.06em] text-[#a9ac9f] sm:text-base">Scored · price-checked · sold here</p>
        <h1 className="tll-display mt-6 max-w-[820px] text-[clamp(48px,5vw,90px)] leading-[.88] tracking-[-.02em] text-white">
          Compare the dose.<br />Then buy it in the same basket.
        </h1>
        <p className="mt-6 max-w-[760px] text-base leading-[1.45] text-[#a9ac9f] sm:text-lg lg:text-xl">
          Compare recorded serving amounts and listed UK prices in one place, then keep your chosen products together in one Lifting Lab account.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={shopHref} className="inline-flex min-h-14 items-center justify-center rounded-lg bg-lab-lime px-8 text-base font-black text-black">Shop by score</Link>
          <Link href="/methodology" className="inline-flex min-h-14 items-center justify-center rounded-lg border border-[#6c6f63] px-8 text-base font-black text-white">How we score</Link>
          <Link href="/stack" className="inline-flex min-h-14 items-center justify-center rounded-lg border border-lab-lime px-8 text-base font-black text-lab-lime">Build my stack</Link>
        </div>
      </div>

      <aside className="rounded-2xl border border-[#32352d] bg-[#151613] px-5 py-5 sm:px-7 sm:py-6" aria-label="Lowest true cost per effective serving">
        <h2 className="text-sm font-black uppercase tracking-[.04em] text-[#a9ac9f] sm:text-base">Lowest true cost per effective serving</h2>
        <div className="mt-4 divide-y divide-[#32352d] border-t border-[#32352d]">
          {GROUPS.map(({ label, categories }) => {
            const product = lowestListed(products, categories)
            return <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-5 py-4 sm:py-5">
              <div className="min-w-0">
                <p className="text-lg font-black text-white sm:text-xl">{label}</p>
                <p className="mt-1 truncate text-sm text-[#a9ac9f] sm:text-base">{product ? `${product.brand} ${product.name}` : 'Assessment currently unavailable'}</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-2xl font-black text-lab-lime sm:text-3xl">{product ? `£${product.cost_per_serving!.toFixed(2)}` : '—'}</p>
                <p className="mt-1 text-xs text-[#a9ac9f] sm:text-sm">{product ? 'per listed serving' : 'under review'}</p>
              </div>
            </div>
          })}
        </div>
        <p className="mt-1 text-xs leading-5 text-[#7f8276]">Effective-serving assessments are currently under review. Displayed figures are the lowest positive listed cost per serving, not an effectiveness recommendation.</p>
      </aside>
    </div>
  </section>
}
