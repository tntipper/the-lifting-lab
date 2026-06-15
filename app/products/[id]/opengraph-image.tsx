import { ImageResponse } from 'next/og'
import { scoreFor } from '@/lib/scores'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Product Score'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function scoreColor(score: number | null): string {
  if (score == null) return '#6b7280'
  if (score >= 70) return '#a6e22e'
  if (score >= 50) return '#f5b342'
  return '#ff5c5c'
}

async function fetchProduct(id: string) {
  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/products?id=eq.${id}&select=id,name,brand,category&status=eq.active`
  try {
    const res = await fetch(url, {
      headers: {
        apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      next: { revalidate: 3600 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return Array.isArray(data) && data.length > 0 ? data[0] : null
  } catch {
    return null
  }
}

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const product = await fetchProduct(id)

  const brand = product?.brand ?? 'The Lifting Lab'
  const name = product?.name ?? 'Supplement'
  const category = (product?.category ?? '').replace(/-/g, ' ').toUpperCase()
  const score = product ? scoreFor(brand, name) : null
  const col = scoreColor(score)
  const displayScore = score != null ? String(score) : '—'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          background: '#0d0d0d',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '60px 72px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a6e22e', fontSize: 22, fontWeight: 900, letterSpacing: 6, textTransform: 'uppercase' }}>
            THE LIFTING LAB
          </span>
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>
            Evidence-Based Scoring
          </span>
        </div>

        {/* main content */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 72 }}>
          {/* score ring */}
          <div
            style={{
              width: 200,
              height: 200,
              borderRadius: '50%',
              border: `8px solid ${col}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#161616',
              boxShadow: `0 0 60px ${col}44`,
              flexShrink: 0,
            }}
          >
            <span style={{ color: col, fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{displayScore}</span>
            <span style={{ color: '#6b7280', fontSize: 13, letterSpacing: 4, textTransform: 'uppercase', marginTop: 6 }}>
              Score
            </span>
          </div>

          {/* product info */}
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ color: '#6b7280', fontSize: 18, textTransform: 'uppercase', letterSpacing: 4 }}>
              {brand}
            </span>
            <span
              style={{
                color: '#ffffff',
                fontSize: name.length > 30 ? 44 : 56,
                fontWeight: 900,
                lineHeight: 1.1,
                marginTop: 12,
              }}
            >
              {name}
            </span>
            {category && (
              <span
                style={{
                  color: '#374151',
                  fontSize: 16,
                  textTransform: 'uppercase',
                  letterSpacing: 4,
                  marginTop: 20,
                }}
              >
                {category}
              </span>
            )}
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13, letterSpacing: 2 }}>
            Effective-dose analysis · EFSA reference values · Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
