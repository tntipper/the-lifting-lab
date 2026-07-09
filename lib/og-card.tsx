// Shared Open Graph / Twitter card renderer for the site's listicle, ranking and
// tool surfaces (/best, /value, /stacks, /faq, /wizard, ...). These pages drive
// most of their traffic from social (TikTok-first, @dadthletelab), so a branded
// per-page share card materially beats falling back to the one generic root card.
//
// Every caller is deterministic and DB-free — the title/subtitle come from local
// data only — so an OG edge function can never fail at runtime. Mirrors the look
// of app/opengraph-image.tsx and app/guide/[category]/opengraph-image.tsx.
import { ImageResponse } from 'next/og'

// Standard OG dimensions, re-exported so each route file stays a thin wrapper.
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_CONTENT_TYPE = 'image/png'

// Headline scales down as the title grows so it always fits one block.
function headlineSize(title: string): number {
  const n = title.length
  if (n > 30) return 62
  if (n > 22) return 78
  if (n > 15) return 96
  if (n > 10) return 112
  return 124
}

// First sentence of a description, capped so it never overruns the card.
export function ogHook(text: string, max = 108): string {
  const firstSentence = text.split(/(?<=\.)\s/)[0] ?? text
  if (firstSentence.length <= max) return firstSentence
  const cut = firstSentence.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`
}

// Turn a URL slug fragment back into a readable, title-cased display name.
// productSlug()/brandSlug() both lowercase + dash-join, so reversing is just:
// split on dashes, capitalise each token. "gold-standard-100-whey" -> "Gold
// Standard 100 Whey". Lossy (a "%" is gone, an "&" reads "And") but perfectly
// legible for a share card — and, critically, needs no DB lookup.
export function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

// Split a "-vs-" matchup slug into its two readable sides. Splits on the FIRST
// "-vs-" (the canonical join direction curatedMatchups uses), so the card is
// derived entirely from the slug with zero I/O and can never fail at runtime —
// which is exactly why /vs and /brands-vs previously had no per-page OG card.
export function vsSidesFromSlug(matchup: string): [string, string] {
  const i = matchup.indexOf('-vs-')
  if (i === -1) return [titleizeSlug(matchup), '']
  return [titleizeSlug(matchup.slice(0, i)), titleizeSlug(matchup.slice(i + 4))]
}

// Each VS side scales down as its name grows so both always fit their block.
function vsSideSize(name: string): number {
  const n = name.length
  if (n > 34) return 40
  if (n > 26) return 50
  if (n > 18) return 62
  if (n > 11) return 74
  return 84
}

// Branded head-to-head card for /vs/[matchup] and /brands-vs/[matchup]: two
// title-cased names stacked around a big lime "VS". DB-free — see vsSidesFromSlug.
export function renderVsCard({ tag, a, b }: { tag: string; a: string; b: string }) {
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
          padding: '54px 72px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* top bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#a6e22e', fontSize: 24, fontWeight: 900, letterSpacing: 7, textTransform: 'uppercase' }}>
            THE LIFTING LAB
          </span>
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>
            {tag}
          </span>
        </div>

        {/* the head-to-head */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <span
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: vsSideSize(a),
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -1,
              maxWidth: 1056,
            }}
          >
            {a}
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '14px 0' }}>
            <span style={{ color: '#a6e22e', fontSize: 64, fontWeight: 900, letterSpacing: 2 }}>VS</span>
            <div style={{ display: 'flex', flex: 1, height: 6, background: '#a6e22e', borderRadius: 3 }} />
          </div>
          <span
            style={{
              display: 'flex',
              color: '#ffffff',
              fontSize: vsSideSize(b),
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -1,
              maxWidth: 1056,
            }}
          >
            {b}
          </span>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13, letterSpacing: 2 }}>
            Effective-dose analysis · UK pricing · Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}

export type OgCard = {
  /** Small lime eyebrow above the headline, e.g. "The 2026 Awards". */
  eyebrow: string
  /** The big white headline, e.g. "Best Value Supplements". */
  title: string
  /** One-line grey supporting hook under the accent rule. */
  subtitle: string
  /** Uppercase label shown top-right, e.g. "Rankings 2026". */
  tag: string
}

// Returns the branded 1200x630 card. Caller supplies its own runtime/size/alt.
export function renderOgCard({ eyebrow, title, subtitle, tag }: OgCard) {
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
          <span style={{ color: '#a6e22e', fontSize: 24, fontWeight: 900, letterSpacing: 7, textTransform: 'uppercase' }}>
            THE LIFTING LAB
          </span>
          <span style={{ color: '#374151', fontSize: 14, letterSpacing: 3, textTransform: 'uppercase' }}>
            {tag}
          </span>
        </div>

        {/* main content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center', minWidth: 0 }}>
          <span style={{ color: '#a6e22e', fontSize: 18, fontWeight: 900, letterSpacing: 5, textTransform: 'uppercase' }}>
            {eyebrow}
          </span>
          <span
            style={{
              color: '#ffffff',
              fontSize: headlineSize(title),
              fontWeight: 900,
              lineHeight: 1.02,
              marginTop: 18,
              letterSpacing: -1,
            }}
          >
            {title}
          </span>
          {/* lime accent rule */}
          <div style={{ display: 'flex', width: 120, height: 6, background: '#a6e22e', borderRadius: 3, marginTop: 28 }} />
          <span style={{ color: '#9ca3af', fontSize: 27, lineHeight: 1.35, marginTop: 26, maxWidth: 1000 }}>
            {subtitle}
          </span>
        </div>

        {/* footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#374151', fontSize: 13, letterSpacing: 2 }}>
            Effective-dose analysis · UK pricing · Not medical advice
          </span>
          <span style={{ color: '#a6e22e', fontSize: 16, fontWeight: 900, letterSpacing: 2 }}>
            @dadthletelab
          </span>
        </div>
      </div>
    ),
    OG_SIZE,
  )
}
