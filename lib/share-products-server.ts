import { createPublicClient } from '@/lib/supabase-public'
import { scoreFor } from '@/lib/scores'
import { resolveShareProducts } from '@/lib/share-products'

export function getShareProducts(ids: readonly string[]) {
  return resolveShareProducts(ids, async requested => {
    const supabase = createPublicClient()
    const { data, error } = await supabase
      .from('products')
      .select('id, name, brand, category, status')
      .eq('status', 'active')
      .in('id', requested)
    if (error) throw new Error('Catalogue lookup failed')
    return data
  }, scoreFor)
}
