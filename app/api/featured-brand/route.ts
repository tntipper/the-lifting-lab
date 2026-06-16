import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'

export const revalidate = 300 // cache for 5 minutes

export async function GET() {
  try {
    const sb = createPublicClient()
    const { data } = await sb
      .from('featured_brands')
      .select('brand_name, tagline, cta_text, cta_url, image_url')
      .eq('active', true)
      .order('display_order')
      .limit(1)
      .maybeSingle()
    return NextResponse.json(data || null)
  } catch {
    return NextResponse.json(null)
  }
}
