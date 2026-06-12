import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'

export async function POST(req: Request) {
  const { category, brand, product, url, notes, email } = await req.json()
  if (!category || !brand || !product || !url) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const sb = createPublicClient()
  const { error } = await sb.from('supplement_submissions').insert({
    category,
    brand,
    product_name: product,
    url,
    notes: notes || null,
    email: email || null,
  })

  if (error) {
    console.error('supplement submission error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
