import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { PRODUCT_COLUMNS, withScore, sortScored, type Product } from '@/lib/products'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {}
        },
      },
    }
  )
}

type FavouriteRow = { product_id: string; products: Product | null }

// GET — list the signed-in user's favourited products (scored), plus their ids.
export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('user_favourites')
    .select(`product_id, products (${PRODUCT_COLUMNS})`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as unknown as FavouriteRow[] | null) || []
  const ids = rows.map((r) => r.product_id)
  const products = sortScored(
    rows.filter((r) => r.products != null).map((r) => withScore(r.products as Product)),
    'score'
  )
  return NextResponse.json({ ids, products })
}

// POST — favourite a product. Idempotent (ignores duplicates).
export async function POST(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let productId: unknown
  try {
    ({ productId } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_favourites')
    .upsert({ user_id: user.id, product_id: productId }, { onConflict: 'user_id,product_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — unfavourite a product.
export async function DELETE(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let productId: unknown
  try {
    ({ productId } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }
  if (typeof productId !== 'string' || !productId) {
    return NextResponse.json({ error: 'productId required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('user_favourites')
    .delete()
    .eq('user_id', user.id)
    .eq('product_id', productId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
