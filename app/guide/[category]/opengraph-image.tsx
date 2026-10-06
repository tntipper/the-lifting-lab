import { ImageResponse } from 'next/og'
import { getGuide } from '@/lib/guides'
import { categoryLabel } from '@/lib/categories'
import { claimsReviewFor } from '@/lib/claims-review'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Buyer’s Guide'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params
  const guide = getGuide(category)

  const label = guide ? categoryLabel(guide.slug) : 'Supplement Guides'
  const hook = claimsReviewFor(category) ? 'Claims under review. No approved product recommendation.' : 'Research guide. Historical values are unverified; product recommendations are unavailable.'

  // Headline scales down for longer category names so it always fits one block.
  const headlineSize = label.length > 16 ? 84 : label.length > 11 ? 104 : 124

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
            Supplement Guide
          </span>
        </div>

        {/* main content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <span style={{ color: '#a6e22e', fontSize: 18, fontWeight: 900, letterSpacing: 5, textTransform: 'uppercase' }}>
            Supplement Research Guide
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
          {/* lime accent rule */}
          <div style={{ display: 'flex', width: 120, height: 6, background: '#a6e22e', borderRadius: 3, marginTop: 28 }} />
          <span style={{ color: '#9ca3af', fontSize: 27, lineHeight: 1.35, marginTop: 26, maxWidth: 980 }}>
            {hook}
          </span>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13, letterSpacing: 2 }}>
            {claimsReviewFor(category) ? 'Claims under review · Not medical advice' : 'Research records · Assessment review incomplete'}
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
