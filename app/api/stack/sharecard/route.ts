import { ImageResponse } from 'next/og'

export const runtime = 'edge'

type StackEntry = { brand: string; name: string; score: number | null; category: string }

const W = 1080
const H = 1920

function scoreColor(score: number | null): string {
  if (score == null) return '#6b7280'
  if (score >= 75) return '#a6e22e'
  if (score >= 50) return '#f5b342'
  return '#ff5c5c'
}

function scoreLabel(score: number | null): string {
  if (score == null) return '—'
  if (score >= 75) return 'Excellent'
  if (score >= 50) return 'Good'
  return 'Weak'
}

function archetype(items: StackEntry[]): string {
  const cats = new Set(items.map((i) => i.category))
  if (cats.has('cycle-support') || cats.has('hormone-support')) return 'Enhanced Athlete'
  if (cats.has('pre-workout') && (cats.has('creatine') || cats.has('whey'))) return 'Performance Focused'
  if (cats.has('creatine') && (cats.has('whey') || cats.has('whey-isolate'))) return 'Strength Builder'
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
  const displayScore = score != null ? String(score) : '—'
  const col = scoreColor(score)
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

        {/* Hero score block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            background: '#161616',
            borderRadius: 32,
            padding: '60px 40px',
            marginBottom: 48,
            border: `2px solid ${col}22`,
          }}
        >
          {/* Score ring */}
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
              background: '#0d0d0d',
              marginBottom: 32,
              boxShadow: `0 0 40px ${col}44`,
            }}
          >
            <span style={{ color: col, fontSize: 72, fontWeight: 900, lineHeight: 1 }}>{displayScore}</span>
            <span style={{ color: '#6b7280', fontSize: 16, letterSpacing: 4, textTransform: 'uppercase', marginTop: 6 }}>
              Score
            </span>
          </div>

          {/* Archetype */}
          <span style={{ color: '#4b5563', fontSize: 16, letterSpacing: 6, textTransform: 'uppercase', marginBottom: 12 }}>
            Archetype
          </span>
          <span style={{ color: '#ffffff', fontSize: 48, fontWeight: 900, lineHeight: 1.1, letterSpacing: -1, textAlign: 'center' }}>
            {arc}
          </span>
          <span style={{ color: '#374151', fontSize: 18, marginTop: 16 }}>
            {items.length} product{items.length === 1 ? '' : 's'} · Clinical scoring
          </span>
        </div>

        {/* Product list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
          {items.slice(0, maxItems).map((item, idx) => {
            const sc = item.score
            const c = scoreColor(sc)
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
                  {scoreLabel(sc)}
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
            EFSA reference doses · Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    { width: W, height: H }
  )
}
