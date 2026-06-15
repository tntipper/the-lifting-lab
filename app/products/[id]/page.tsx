import type { Metadata } from 'next'
import { createPublicClient } from '@/lib/supabase-public'
import { scoreFor } from '@/lib/scores'
import { categoryLabel } from '@/lib/categories'
import ProductDetailPage from './ProductDetailPage'

type Props = { params: Promise<{ id: string }> }

async function fetchProductMeta(id: string) {
  const sb = createPublicClient()
  const { data } = await sb
    .from('products')
    .select('id, name, brand, category')
    .eq('id', id)
    .eq('status', 'active')
    .maybeSingle()
  return data as { id: string; name: string; brand: string; category: string } | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const product = await fetchProductMeta(id)
  if (!product) return { title: 'Product Not Found | The Lifting Lab' }

  const score = scoreFor(product.brand, product.name)
  const cat = categoryLabel(product.category)
  const title = `${product.brand} ${product.name} Score & Review | The Lifting Lab`
  const description = score != null
    ? `${product.brand} ${product.name} scores ${score}/100 on our Effectiveness Match ${cat.toLowerCase()} rating. Dose-for-dose analysis vs EFSA reference values.`
    : `${product.brand} ${product.name} — evidence-based ${cat.toLowerCase()} analysis from The Lifting Lab.`

  return {
    title,
    description,
    openGraph: { title, description, type: 'article' },
    twitter: { card: 'summary_large_image', title, description },
  }
}

export default async function Page({ params }: Props) {
  const { id } = await params
  return <ProductDetailPage id={id} />
}
