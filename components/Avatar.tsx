import type { ReactNode } from 'react'

// Shared circular avatar. Standard/premium/seasonal avatars are rendered from
// inline SVG keyed by slug (no hosted assets needed); custom_photo renders the
// uploaded image. Used on leaderboard rows, dashboard, reviews and the picker.

type AvatarTheme = { ring: string; from: string; to: string; fg: string; icon: ReactNode }

const S = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round" width="60%" height="60%">{children}</svg>
)

// Per-slug theme + glyph. Families: standard (lime), premium (gold), seasonal (cyan/brand).
const THEMES: Record<string, AvatarTheme> = {
  // ── Standard (free) ──
  barbell:   { ring: '#a6e22e', from: '#1d2a0c', to: '#0f1505', fg: '#a6e22e',
    icon: S(<><path d="M3 12h18" /><path d="M5 8v8M7 8v8M17 8v8M19 8v8" /></>) },
  flask:     { ring: '#a6e22e', from: '#102015', to: '#0a130c', fg: '#a6e22e',
    icon: S(<><path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" /><path d="M7.5 15h9" /></>) },
  dumbbell:  { ring: '#a6e22e', from: '#1d2a0c', to: '#0f1505', fg: '#a6e22e',
    icon: S(<><path d="M7 9v6M5 8v8M17 9v6M19 8v8M7 12h10" /></>) },
  flame:     { ring: '#e8a020', from: '#2a1808', to: '#160c04', fg: '#e8a020',
    icon: S(<path d="M12 3s5 4 5 9a5 5 0 0 1-10 0c0-2 1-3 1-3s0 2 2 2c1.5 0 1.5-2 1-4-.4-1.6 1-5 1-5z" />) },
  lightning: { ring: '#3fc9d6', from: '#08222a', to: '#041216', fg: '#3fc9d6',
    icon: S(<path d="M13 2 4 14h6l-1 8 9-12h-6z" />) },
  trophy:    { ring: '#e8a020', from: '#2a1d08', to: '#160f04', fg: '#e8a020',
    icon: S(<><path d="M7 4h10v4a5 5 0 0 1-10 0z" /><path d="M5 5H3v2a3 3 0 0 0 3 3M19 5h2v2a3 3 0 0 1-3 3M9 18h6M10 14v4M14 14v4M8 21h8" /></>) },
  // ── Premium (points unlock) ──
  'gold-barbell':  { ring: '#f5c542', from: '#332300', to: '#1a1200', fg: '#f5c542',
    icon: S(<><path d="M3 12h18" /><path d="M5 8v8M7 8v8M17 8v8M19 8v8" /></>) },
  'lab-scientist': { ring: '#7ee0ff', from: '#0a2230', to: '#05131a', fg: '#7ee0ff',
    icon: S(<><circle cx="12" cy="8" r="3" /><path d="M6 21v-2a6 6 0 0 1 12 0v2" /><path d="M9 8h6" /></>) },
  'neon-lion':     { ring: '#ff5cc8', from: '#2a0a22', to: '#160512', fg: '#ff5cc8',
    icon: S(<><circle cx="12" cy="12" r="5" /><path d="M12 4v3M12 17v3M4 12h3M17 12h3M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" /></>) },
  'elite-badge':   { ring: '#f5c542', from: '#2a2200', to: '#161100', fg: '#f5c542',
    icon: S(<><path d="M12 2 4 6v6c0 5 8 8 8 8s8-3 8-8V6z" /><path d="m9 12 2 2 4-4" /></>) },
}

const SEASONAL: AvatarTheme = { ring: '#2e8fe0', from: '#06203a', to: '#03111f', fg: '#7ec3ff',
  icon: S(<><path d="M12 2l2.4 6.6L21 9l-5 4.3L17.5 21 12 17.3 6.5 21 8 13.3 3 9l6.6-.4z" /></>) }

const SIZES = { xs: 24, sm: 32, md: 44, lg: 72 } as const
export type AvatarSize = keyof typeof SIZES

export default function Avatar({
  type = 'standard',
  avatarId = 'barbell',
  url = null,
  username = '',
  size = 'md',
}: {
  type?: string
  avatarId?: string
  url?: string | null
  username?: string
  size?: AvatarSize
}) {
  const px = SIZES[size]

  if (type === 'custom_photo' && url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={username || 'avatar'}
        width={px}
        height={px}
        className="rounded-full object-cover shrink-0"
        style={{ width: px, height: px, border: '2px solid rgba(166,226,46,0.5)' }}
      />
    )
  }

  const theme: AvatarTheme =
    THEMES[avatarId] ?? (avatarId.startsWith('season-') ? SEASONAL : THEMES.barbell)

  return (
    <span
      className="inline-flex items-center justify-center rounded-full shrink-0 select-none"
      title={username || avatarId}
      style={{
        width: px,
        height: px,
        color: theme.fg,
        background: `radial-gradient(circle at 30% 25%, ${theme.from}, ${theme.to})`,
        border: `2px solid ${theme.ring}`,
        boxShadow: `0 0 ${size === 'lg' ? 14 : 8}px ${theme.ring}33`,
      }}
    >
      {theme.icon}
    </span>
  )
}
