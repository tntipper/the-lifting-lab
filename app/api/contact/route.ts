import { NextResponse } from 'next/server'
import { createPublicClient } from '@/lib/supabase-public'

export async function POST(req: Request) {
  const { name, email, message } = await req.json()
  if (!name || !email || !message) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const sb = createPublicClient()
  const { error } = await sb.from('contact_submissions').insert({ name, email, message })

  if (error) {
    console.error('contact submission error:', error)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
