import { ImageResponse } from 'next/og'
import { parseShareProductIds } from '@/lib/share-products'
import { assessmentDisplayFor } from '@/lib/assessment-display'
import { getShareProducts } from '@/lib/share-products-server'

export const runtime = 'edge'

const W = 1080
const H = 1920


export async function GET(request: Request) {
  const ids = parseShareProductIds(new URL(request.url).searchParams)
  if (ids === null) {
    return Response.json({ error: 'Supply at most 50 product IDs; custom card data is not accepted' }, { status: 400 })
  }
  const result = await getShareProducts(ids)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status, headers: { 'Cache-Control': 'no-store' } })
  }
  const items = result.products
  const maxItems = 10

  return new ImageResponse(
    (
      <div
        style={{
          width: W,
          height: H,
          background: '#0d0d0d',
          display: 'flex',
          flexDirection: 'column',
          padding: '80px 72px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Brand header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 80 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#a6e22e', fontSize: 28, fontWeight: 900, letterSpacing: 8, textTransform: 'uppercase' }}>
              THE LIFTING LAB
            </span>
            <span style={{ color: '#374151', fontSize: 18, marginTop: 6, letterSpacing: 3 }}>
              theliftinglab.co.uk
            </span>
          </div>
          <span style={{ color: '#1f2937', fontSize: 16, letterSpacing: 3, textTransform: 'uppercase' }}>
            My Stack
          </span>
        </div>

        {/* A personal selection is not an assessed combined stack. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: '#161616',
            borderRadius: 32,
            padding: '60px 40px',
            marginBottom: 48,
            border: '2px solid #a6e22e22',
          }}
        >
          <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 900, textAlign: 'center' }}>
            My Supplement Selection
          </span>
          <span style={{ color: '#9ca3af', fontSize: 22, marginTop: 24 }}>
            {items.length} product{items.length === 1 ? '' : 's'} · Historical catalogue values
          </span>
          <span style={{ color: '#9ca3af', fontSize: 20, marginTop: 16, textAlign: 'center' }}>
            This selection has not been assessed as a combined stack.
          </span>
        </div>

        {/* Product list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {items.slice(0, maxItems).map((item, idx) => {
            const assessment = assessmentDisplayFor(item)
            const sc = assessment.score
            const c = '#9ca3af'
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#161616',
                  borderRadius: 20,
                  padding: '20px 28px',
                  gap: 24,
                  border: '1px solid #1f1f1f',
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    border: `3px solid ${c}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    background: '#0d0d0d',
                  }}
                >
                  <span style={{ color: c, fontSize: 22, fontWeight: 900 }}>
                    {sc != null ? sc : '?'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span style={{ color: '#6b7280', fontSize: 15, textTransform: 'uppercase', letterSpacing: 3 }}>
                    {item.brand}
                  </span>
                  <span style={{ color: '#ffffff', fontSize: 20, fontWeight: 700, marginTop: 2 }}>
                    {item.name}
                  </span>
                </div>
                <span style={{ color: c, fontSize: 15, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, flexShrink: 0 }}>
                  {assessment.label}
                </span>
              </div>
            )
          })}
          {items.length > maxItems && (
            <div style={{ color: '#374151', fontSize: 16, textAlign: 'center', marginTop: 4 }}>
              +{items.length - maxItems} more products
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 56,
            paddingTop: 32,
            borderTop: '1px solid #1f2937',
          }}
        >
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 2 }}>
            Scientific review incomplete · No combined-stack assessment
          </span>
          <span style={{ color: '#a6e22e', fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    { width: W, height: H, headers: { 'Cache-Control': 'no-store' } }
  )
}
