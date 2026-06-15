import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Evidence-Based Supplement Scoring'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

function Pill({ value, color }: { value: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        width: 132,
        height: 132,
        borderRadius: '50%',
        border: `7px solid ${color}`,
        background: '#161616',
        boxShadow: `0 0 48px ${color}33`,
      }}
    >
      <span style={{ color, fontSize: 52, fontWeight: 900, lineHeight: 1 }}>{value}</span>
      <span style={{ color: '#6b7280', fontSize: 11, letterSpacing: 3, textTransform: 'uppercase', marginTop: 4 }}>
        Score
      </span>
    </div>
  )
}

export default function Image() {
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
          <span style={{ color: '#a6e22e', fontSize: 26, fontWeight: 900, letterSpacing: 7, textTransform: 'uppercase' }}>
            THE LIFTING LAB
          </span>
          <span style={{ color: '#374151', fontSize: 15, letterSpacing: 3, textTransform: 'uppercase' }}>
            Evidence-Based Scoring
          </span>
        </div>

        {/* main content */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 64 }}>
          <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
            <span style={{ color: '#ffffff', fontSize: 64, fontWeight: 900, lineHeight: 1.05 }}>
              200+ supplements,
            </span>
            <span style={{ color: '#a6e22e', fontSize: 64, fontWeight: 900, lineHeight: 1.05 }}>
              ranked 0–100.
            </span>
            <span style={{ color: '#9ca3af', fontSize: 24, marginTop: 24, lineHeight: 1.3 }}>
              Scored against effective reference doses. No hype, no fluff — just what works.
            </span>
          </div>

          {/* score pills */}
          <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
            <Pill value="92" color="#a6e22e" />
            <Pill value="64" color="#f5b342" />
            <Pill value="38" color="#ff5c5c" />
          </div>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 2 }}>
            Effective-dose analysis · EFSA reference values · Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 17, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  )
}
