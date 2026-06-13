'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { scoreColor } from '@/components/ScoreBadge'
import type { ScoredProduct } from '@/lib/products'

type GroupStats = { count: number; topScore: number | null }

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r},${g},${b}`
}

function TileCard({
  group,
  stats,
}: {
  group: (typeof CATEGORY_GROUPS)[0]
  stats: GroupStats | undefined
}) {
  const ref = useRef<HTMLAnchorElement>(null)
  const topScore = stats?.topScore ?? null
  const scoreCol = topScore != null ? scoreColor(topScore) : null
  const rgb = hexToRgb(group.accent)

  function handleMouseMove(e: React.MouseEvent) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%')
    el.style.setProperty('--my', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%')
  }

  return (
    <>
      <style>{`
        .tile-${group.slug} {
          --glint: 0;
        }
        .tile-${group.slug}:hover {
          --glint: 0.06;
          border-color: rgba(${rgb},0.4) !important;
          box-shadow: 0 8px 28px rgba(0,0,0,0.55), 0 0 16px rgba(${rgb},0.15), inset 0 1px 0 rgba(255,255,255,0.06) !important;
          transform: translateY(-3px);
        }
      `}</style>
      <Link
        ref={ref}
        href={`/products?group=${group.slug}`}
        onMouseMove={handleMouseMove}
        className={`tile-${group.slug} beam group relative block rounded-2xl transition-all duration-250 active:scale-[0.97]`}
        style={
          {
            '--mx': '50%',
            '--my': '30%',
            background: `
              radial-gradient(240px circle at var(--mx) var(--my), rgba(255,255,255,var(--glint,0)) 0%, transparent 60%),
              linear-gradient(160deg, rgba(${rgb},0.09) 0%, #0f0f0f 55%)
            `,
            border: `1px solid rgba(${rgb},0.2)`,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
          } as React.CSSProperties
        }
      >
        {/* shimmer top edge */}
        <span
          className="pointer-events-none absolute top-0 left-[10%] right-[10%] h-px"
          style={{ background: `linear-gradient(90deg,transparent,rgba(${rgb},0.4),transparent)` }}
        />

      <div className="flex flex-col gap-0 p-3.5">
        {/* icon tile */}
        <div
          className="relative w-11 h-11 rounded-xl flex items-center justify-center text-2xl mb-3 shrink-0"
          style={{
            background: `linear-gradient(160deg, rgba(${rgb},0.14), rgba(${rgb},0.06))`,
            border: `1px solid rgba(${rgb},0.35)`,
            boxShadow: `0 6px 16px rgba(0,0,0,0.5), 0 2px 4px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        >
          {/* icon bloom */}
          <span
            className="pointer-events-none absolute inset-[-4px] rounded-[14px]"
            style={{
              background: `radial-gradient(ellipse at center, rgba(${rgb},0.22) 0%, transparent 70%)`,
              filter: 'blur(6px)',
            }}
          />
          <svg
            viewBox="0 0 24 24"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="relative z-10 w-6 h-6"
            style={{ stroke: `rgba(${rgb},1)`, strokeWidth: '1.6' }}
            dangerouslySetInnerHTML={{ __html: group.iconSvg }}
          />
        </div>

        {/* label + tagline */}
        <p className="text-white font-black text-[15px] leading-none tracking-tight">{group.label}</p>
        <p className="text-[11px] mt-1 leading-tight" style={{ color: `rgba(${rgb},0.75)` }}>{group.tagline}</p>

        {/* bottom row: product count + top score */}
        <div className="flex items-center justify-between mt-3 pt-2.5" style={{ borderTop: `1px solid rgba(${rgb},0.12)` }}>
          <span className="text-[10px] font-bold uppercase tracking-widest text-white/35">
            {stats ? `${stats.count} ranked` : '…'}
          </span>
          {topScore != null && scoreCol && (
            <span
              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border"
              style={{ color: scoreCol, borderColor: `${scoreCol}44`, background: `${scoreCol}14` }}
            >
              top {topScore}
            </span>
          )}
        </div>
      </div>
    </Link>
    </>
  )
}

function GuideTile() {
  const rgb = '166,226,46'
  return (
    <Link
      href="/guide"
      className="beam relative block rounded-2xl transition-all duration-250 active:scale-[0.97]"
      style={{
        background: `linear-gradient(160deg, rgba(${rgb},0.07) 0%, #0f0f0f 55%)`,
        border: `1px solid rgba(${rgb},0.15)`,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <span
        className="pointer-events-none absolute top-0 left-[10%] right-[10%] h-px"
        style={{ background: `linear-gradient(90deg,transparent,rgba(${rgb},0.3),transparent)` }}
      />
      <div className="flex flex-col gap-0 p-3.5">
        <div
          className="relative w-11 h-11 rounded-xl flex items-center justify-center mb-3 shrink-0"
          style={{
            background: `linear-gradient(160deg, rgba(${rgb},0.12), rgba(${rgb},0.05))`,
            border: `1px solid rgba(${rgb},0.3)`,
            boxShadow: `0 6px 16px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)`,
          }}
        >
          <span
            className="pointer-events-none absolute inset-[-4px] rounded-[14px]"
            style={{
              background: `radial-gradient(ellipse at center, rgba(${rgb},0.18) 0%, transparent 70%)`,
              filter: 'blur(6px)',
            }}
          />
          <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round" className="relative z-10 w-6 h-6" style={{ stroke: `rgba(${rgb},1)`, strokeWidth: '1.6' }}>
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5z"/>
          </svg>
        </div>
        <p className="text-white font-black text-[15px] leading-none tracking-tight">Guides</p>
        <p className="text-[11px] mt-1 leading-tight" style={{ color: `rgba(${rgb},0.75)` }}>How to supplement smart</p>
        <div className="flex items-center mt-3 pt-2.5" style={{ borderTop: `1px solid rgba(${rgb},0.1)` }}>
          <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: `rgba(${rgb},0.6)` }}>Read guides →</span>
        </div>
      </div>
    </Link>
  )
}

export default function CategoryGrid() {
  const [stats, setStats] = useState<Record<string, GroupStats>>({})

  useEffect(() => {
    fetch('/api/products?sort=score')
      .then((r) => r.json())
      .then((products: ScoredProduct[]) => {
        const computed: Record<string, GroupStats> = {}
        for (const group of CATEGORY_GROUPS) {
          const matches = products.filter((p) => group.categories.includes(p.category))
          const scores = matches.map((p) => p.score).filter((s): s is number => s != null)
          computed[group.slug] = {
            count: matches.length,
            topScore: scores.length > 0 ? Math.max(...scores) : null,
          }
        }
        setStats(computed)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="grid grid-cols-2 gap-3">
      {CATEGORY_GROUPS.map((group) => (
        <TileCard key={group.slug} group={group} stats={stats[group.slug]} />
      ))}
      {/* Guides — static tile, always last */}
      <GuideTile />
    </div>
  )
}
