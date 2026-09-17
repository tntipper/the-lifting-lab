import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'
import { CATEGORIES } from '@/lib/categories'
export const revalidate = 86400
export const metadata: Metadata = { title: 'Supplement research by category | The Lifting Lab', description: 'Effectiveness rankings and best-product awards are unavailable until product assessments are approved. Browse the underlying research records and listed prices.', alternates: { canonical: 'https://www.theliftinglab.co.uk/best' } }
export default function ResearchPage() {
  return <div className="min-h-screen bg-lab-bg text-white"><TopNav /><main className="max-w-5xl mx-auto px-4 py-10 space-y-6">
    <h1 className="text-3xl font-black">Supplement research by category</h1>
    <div className="rounded-xl border border-lab-border bg-lab-panel p-5 space-y-3"><h2 className="font-bold">No approved effectiveness recommendations</h2><p>Effectiveness rankings and best-product awards are unavailable until product assessments are approved.</p><p>Historical scores remain unverified research values. They do not establish effectiveness, appropriate dosing or a best buy.</p></div>
    <div className="flex flex-wrap gap-4"><Link className="underline" href="/products">All product research</Link><Link className="underline" href="/cheapest">Listed prices only</Link><Link className="underline" href="/stack">Manual research stack</Link></div>
    <section><h2 className="font-bold mb-4">Research categories</h2><div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">{CATEGORIES.map(category => <Link key={category.slug} href={`/best/${category.slug}`} className="rounded-xl border border-lab-border p-4">{category.label}</Link>)}</div></section>
  </main></div>
}
