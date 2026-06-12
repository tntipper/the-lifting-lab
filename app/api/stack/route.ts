import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

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

// GET — fetch user's active stack with products + nutrients
export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get or create default stack
  let { data: stack } = await supabase
    .from('user_stacks')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!stack) {
    const { data: newStack } = await supabase
      .from('user_stacks')
      .insert({ user_id: user.id, name: 'My Stack', is_active: true })
      .select('id')
      .single()
    stack = newStack
  }

  if (!stack) return NextResponse.json({ stackId: null, items: [] })

  const { data: items } = await supabase
    .from('stack_products')
    .select(`
      id,
      servings_per_day,
      products (
        id, name, brand, category, serving_size, serving_unit,
        product_nutrients (nutrient_name, amount, unit)
      )
    `)
    .eq('stack_id', stack.id)

  return NextResponse.json({ stackId: stack.id, items: items || [] })
}

// POST — add product to stack
export async function POST(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { productId, servingsPerDay: rawServings = 1 } = await request.json()
  const servingsPerDay = Math.min(Math.max(Math.round(Number(rawServings) || 1), 1), 10)

  let { data: stack } = await supabase
    .from('user_stacks')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!stack) {
    const { data: newStack } = await supabase
      .from('user_stacks')
      .insert({ user_id: user.id, name: 'My Stack', is_active: true })
      .select('id')
      .single()
    stack = newStack
  }

  if (!stack) return NextResponse.json({ error: 'Could not create stack' }, { status: 500 })

  const { error } = await supabase
    .from('stack_products')
    .upsert(
      { stack_id: stack.id, product_id: productId, servings_per_day: servingsPerDay },
      { onConflict: 'stack_id,product_id' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE — remove product from stack
export async function DELETE(request: Request) {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { stackProductId } = await request.json()

  const { error } = await supabase
    .from('stack_products')
    .delete()
    .eq('id', stackProductId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
