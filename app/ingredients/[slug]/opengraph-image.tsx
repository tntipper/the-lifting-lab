import { ImageResponse } from 'next/og'
import { getIngredient } from '@/lib/ingredients'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Ingredient Guide'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// First sentence of the one-liner, capped so it never overruns the card.
function hookFrom(text: string, max = 110): string {
  const firstSentence = text.split(/(?<=\.)\s/)[0] ?? text
  if (firstSentence.length <= max) return firstSentence
  const cut = firstSentence.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const ing = getIngredient(slug)

  const label = ing ? ing.name : 'Supplement Ingredients'
  const hook = ing
    ? hookFrom(ing.oneLiner)
    : 'What each supplement ingredient does, the effective dose, and the safe limit.'
  const evidence = ing ? `${ing.evidence} evidence` : 'Evidence-based'

  // Headline scales down for longer ingredient names so it always fits.
  const headlineSize = label.length > 18 ? 76 : label.length > 12 ? 100 : 124

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a6e22e', fontSize: 22, fontWeight: 900, letterSpacing: 6, textTransform: 'uppercase' }}>
            THE LIFTING LAB
          </span>
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>
            Ingredient Library
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <span style={{ color: '#a6e22e', fontSize: 18, fontWeight: 900, letterSpacing: 5, textTransform: 'uppercase' }}>
            Supplement Ingredient · {evidence}
          </span>
          <span
            style={{
              color: '#ffffff',
              fontSize: headlineSize,
              fontWeight: 900,
              lineHeight: 1.02,
              marginTop: 18,
              letterSpacing: -1,
            }}
          >
            {label}
          </span>
          <div style={{ display: 'flex', width: 120, height: 6, background: '#a6e22e', borderRadius: 3, marginTop: 28 }} />
          <span style={{ color: '#9ca3af', fontSize: 27, lineHeight: 1.35, marginTop: 26, maxWidth: 980 }}>
            {hook}
          </span>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13, letterSpacing: 2 }}>
            Effective dose · Safe limit · Not medical advice
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
