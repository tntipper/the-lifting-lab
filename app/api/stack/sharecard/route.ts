import { ImageResponse } from 'next/og'

export const runtime = 'edge'

type StackEntry = { brand: string; name: string; score: number | null; category: string }

function scoreColor(score: number | null): string {
  if (score == null) return '#6b7280'
  if (score >= 75) return '#a6e22e'
  if (score >= 50) return '#f5b342'
  return '#ff5c5c'
}

function archetype(items: StackEntry[]): string {
  const cats = new Set(items.map((i) => i.category))
  if (cats.has('cycle-support') || cats.has('hormone-support')) return 'Enhanced Athlete'
  if (cats.has('pre-workout') && (cats.has('creatine') || cats.has('whey'))) return 'Performance Focused'
  if (cats.has('creatine') && cats.has('whey')) return 'Strength Builder'
  if (cats.has('multivitamin') && cats.has('omega')) return 'Health-First Lifter'
  if (cats.has('pre-workout')) return 'Stimmed-Up Athlete'
  if (cats.has('creatine')) return 'Creatine Maximiser'
  return 'Supplement Stack'
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const raw = searchParams.get('data')

  let score: number | null = null
  let items: StackEntry[] = []

  if (raw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(raw))
      score = parsed.score ?? null
      items = parsed.items ?? []
    } catch {}
  }

  const arc = archetype(items)
  const displayScore = score != null ? score : '—'
  const col = score != null ? scoreColor(score) : '#6b7280'

  return new ImageResponse(
    (
      <div
        style={{
          width: 1080,
          height: 1080,
          background: '#111111',
          display: 'flex',
          flexDirection: 'column',
          padding: '72px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#a6e22e', fontSize: 20, fontWeight: 900, letterSpacing: 6, textTransform: 'uppercase' }}>
              THE LIFTING LAB
            </span>
            <span style={{ color: '#4b5563', fontSize: 14, marginTop: 4, letterSpacing: 2 }}>
              theliftinglab.co.uk
            </span>
          </div>
          <span style={{ color: '#1f2937', fontSize: 13, letterSpacing: 2, textTransform: 'uppercase' }}>
            My Stack
          </span>
        </div>

        {/* Score ring area */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 40, marginBottom: 56 }}>
          {/* Score circle */}
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: '50%',
              border: `6px solid ${col}`,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#1a1a1a',
              flexShrink: 0,
            }}
          >
            <span style={{ color: col, fontSize: 52, fontWeight: 900, lineHeight: 1 }}>{displayScore}</span>
            <span style={{ color: '#6b7280', fontSize: 13, letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 }}>
              Stack Score
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ color: '#6b7280', fontSize: 14, letterSpacing: 4, textTransform: 'uppercase', marginBottom: 8 }}>
              Archetype
            </span>
            <span style={{ color: '#ffffff', fontSize: 36, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1 }}>
              {arc}
            </span>
            <span style={{ color: '#4b5563', fontSize: 14, marginTop: 12 }}>
              {items.length} product{items.length === 1 ? '' : 's'} • Clinical scoring
            </span>
          </div>
        </div>

        {/* Product list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
          {items.slice(0, 8).map((item, idx) => {
            const sc = item.score
            const c = scoreColor(sc)
            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: '#1a1a1a',
                  borderRadius: 16,
                  padding: '16px 24px',
                  gap: 20,
                  border: '1px solid #222222',
                }}
              >
                <div
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: '50%',
                    border: `3px solid ${c}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ color: c, fontSize: 18, fontWeight: 900 }}>
                    {sc != null ? sc : '?'}
                  </span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                  <span style={{ color: '#9ca3af', fontSize: 13, textTransform: 'uppercase', letterSpacing: 2 }}>
                    {item.brand}
                  </span>
                  <span style={{ color: '#ffffff', fontSize: 17, fontWeight: 700 }}>
                    {item.name}
                  </span>
                </div>
                <span
                  style={{
                    color: c,
                    fontSize: 13,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    flexShrink: 0,
                  }}
                >
                  {sc != null && sc >= 75 ? 'Excellent' : sc != null && sc >= 50 ? 'Good' : sc != null ? 'Weak' : '—'}
                </span>
              </div>
            )
          })}
          {items.length > 8 && (
            <div style={{ color: '#4b5563', fontSize: 14, textAlign: 'center', marginTop: 4 }}>
              +{items.length - 8} more products
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 40,
            paddingTop: 24,
            borderTop: '1px solid #1f2937',
          }}
        >
          <span style={{ color: '#374151', fontSize: 12, letterSpacing: 2 }}>
            Scores based on EFSA reference doses • Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 13, fontWeight: 700, letterSpacing: 1 }}>
            theliftinglab.co.uk
          </span>
        </div>
      </div>
    ),
    { width: 1080, height: 1080 }
  )
}
