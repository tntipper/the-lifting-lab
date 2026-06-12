'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import { scoreColor } from '@/components/ScoreBadge'
import type { ScoredProduct } from '@/lib/products'

type GroupStats = { count: number; topScore: number | null }

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
      {CATEGORY_GROUPS.map((group) => {
        const s = stats[group.slug]
        const topScore = s?.topScore ?? null
        const color = topScore != null ? scoreColor(topScore) : '#4b5563'

        return (
          <Link
            key={group.slug}
            href={`/products?group=${group.slug}`}
            className="bg-lab-panel border border-lab-border rounded-2xl p-4 hover:border-lab-lime transition-colors active:scale-[0.98]"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-2xl leading-none">{group.icon}</span>
              {topScore != null && (
                <span
                  className="text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded-full border"
                  style={{ color, borderColor: `${color}44`, background: `${color}11` }}
                >
                  top {topScore}
                </span>
              )}
            </div>
            <p className="text-white font-black text-base mt-3 leading-none">{group.label}</p>
            <p className="text-lab-muted text-[11px] mt-1">
              {s ? `${s.count} ranked` : '…'}
            </p>
          </Link>
        )
      })}
    </div>
  )
}
