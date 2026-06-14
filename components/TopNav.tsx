'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'

const AR = '166,226,46'

const NAV_LINKS = [
  { href: '/products', label: 'Browse' },
  { href: '/wizard', label: 'Find My Stack' },
  { href: '/leaderboard', label: 'Leaderboard' },
]

export default function TopNav() {
  const pathname = usePathname()
  const sweepRef = useRef<HTMLDivElement>(null)
  const prevPath = useRef(pathname)
  const [menuOpen, setMenuOpen] = useState(false)
  // null = unknown (still checking), then true/false once auth resolves
  const [signedIn, setSignedIn] = useState<boolean | null>(null)

  useEffect(() => {
    createClient()
      .auth.getUser()
      .then(({ data }) => setSignedIn(!!data.user))
      .catch(() => setSignedIn(false))
  }, [])

  useEffect(() => {
    if (prevPath.current === pathname) return
    prevPath.current = pathname
    setMenuOpen(false) // close mobile menu on navigation
    const el = sweepRef.current
    if (!el) return
    el.classList.remove('run')
    void el.offsetWidth
    el.classList.add('run')
  }, [pathname])

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  // Account button target: signed-in → dashboard, signed-out → auth.
  // While auth is unknown we point at /dashboard, which itself redirects
  // unauthenticated users to /auth — so the link is always safe.
  const accountHref = signedIn === false ? '/auth' : '/dashboard'
  const accountLabel = signedIn === false ? 'Sign In' : 'My Account'

  return (
    <>
      {/* light sweep — fixed, full height, triggers on nav change */}
      <div ref={sweepRef} className="lab-sweep" />

      <header
        className="sticky top-0 z-20 backdrop-blur"
        style={{
          background: 'rgba(12,12,12,0.92)',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between gap-3">
          {/* wordmark — Anton, skewed, LAB in lime */}
          <Link
            href="/"
            className="shrink-0 uppercase select-none"
            style={{
              fontFamily: 'var(--font-anton), Impact, "Arial Narrow Bold", sans-serif',
              fontSize: '20px',
              letterSpacing: '0.5px',
              transform: 'skewX(-6deg)',
              display: 'inline-block',
              lineHeight: 1,
            }}
          >
            THE LIFTING
            <span style={{ color: '#a6e22e', textShadow: `0 0 14px rgba(${AR},0.45)` }}>LAB</span>
          </Link>

          <nav className="flex items-center gap-4">
            {/* nav links — hidden on mobile, shown from sm breakpoint up */}
            <div className="hidden sm:flex items-center gap-5">
              {NAV_LINKS.map(({ href, label }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    className="relative text-[11px] font-bold uppercase tracking-widest py-1.5 transition-colors"
                    style={active
                      ? { color: '#a6e22e', textShadow: `0 0 8px rgba(${AR},0.5)` }
                      : { color: '#a3a3a3' }
                    }
                  >
                    {active && (
                      <>
                        <span
                          className="pointer-events-none absolute"
                          style={{
                            top: '-20px', left: '50%', transform: 'translateX(-50%)',
                            width: '42px', height: '18px',
                            background: `radial-gradient(ellipse at top, rgba(${AR},0.3) 0%, transparent 80%)`,
                            filter: 'blur(4px)',
                          }}
                        />
                        <span
                          className="pointer-events-none absolute"
                          style={{
                            top: '-19px', left: '50%', transform: 'translateX(-50%)',
                            width: '42px', height: '1px',
                            background: `linear-gradient(90deg, transparent, #a6e22e, transparent)`,
                            boxShadow: '0 0 8px #a6e22e',
                          }}
                        />
                      </>
                    )}
                    {label}
                  </Link>
                )
              })}
            </div>

            {/* My Account — ghost outline button, always visible */}
            <Link
              href={accountHref}
              className="text-[11px] font-black uppercase tracking-widest rounded-lg px-3 py-1.5 transition-all whitespace-nowrap"
              style={{
                color: '#a6e22e',
                border: `1px solid rgba(${AR},0.6)`,
                boxShadow: `0 0 8px rgba(${AR},0.2), inset 0 0 8px rgba(${AR},0.05)`,
              }}
            >
              {accountLabel}
            </Link>

            {/* hamburger — mobile only, toggles the nav-link panel */}
            <button
              type="button"
              aria-label="Toggle menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
              className="sm:hidden flex flex-col items-center justify-center w-8 h-8 gap-[5px] rounded-lg transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}
            >
              <span
                className="block w-4 h-[2px] rounded-full transition-all"
                style={{
                  background: menuOpen ? '#a6e22e' : '#e5e5e5',
                  transform: menuOpen ? 'translateY(3.5px) rotate(45deg)' : 'none',
                }}
              />
              <span
                className="block w-4 h-[2px] rounded-full transition-all"
                style={{
                  background: menuOpen ? '#a6e22e' : '#e5e5e5',
                  transform: menuOpen ? 'translateY(-3.5px) rotate(-45deg)' : 'none',
                }}
              />
            </button>
          </nav>
        </div>

        {/* mobile dropdown panel — only rendered when open */}
        {menuOpen && (
          <div
            className="sm:hidden border-t"
            style={{ borderColor: 'rgba(255,255,255,0.06)', background: 'rgba(12,12,12,0.98)' }}
          >
            <div className="max-w-5xl mx-auto px-4 py-2 flex flex-col">
              {NAV_LINKS.map(({ href, label }) => {
                const active = isActive(href)
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMenuOpen(false)}
                    className="text-[13px] font-bold uppercase tracking-widest py-3 transition-colors"
                    style={active ? { color: '#a6e22e' } : { color: '#d4d4d4' }}
                  >
                    {label}
                  </Link>
                )
              })}
            </div>
          </div>
        )}
      </header>
    </>
  )
}
