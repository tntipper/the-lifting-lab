'use client'

import { hasApprovedAssessment } from '@/lib/assessment-display'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { CATEGORY_GROUPS } from '@/lib/category-groups'
import type { ScoredProduct } from '@/lib/products'

type GroupStats = { count: number; topScore: number | null }

function TileCard({ group, stats }: {
  group: (typeof CATEGORY_GROUPS)[0]
  stats: GroupStats | undefined
}) {
  return (
    <Link
      href={`/products?group=${group.slug}`}
      className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tll-display text-[26px] leading-7 text-white">{group.label}</p>
          <p className="mt-2 text-sm leading-5 text-lab-muted">{group.tagline}</p>
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-7 w-7 shrink-0"
          style={{ stroke: group.accent, strokeWidth: '1.5' }}
          dangerouslySetInnerHTML={{ __html: group.iconSvg }}
        />
      </div>
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-lab-border pt-3 text-xs text-lab-muted">
        <span>{stats ? `${stats.count} listed` : 'Loading…'}</span>
        <span className="font-semibold text-lab-lime group-hover:underline">Explore →</span>
      </div>
    </Link>
  )
}

function GuideTile() {
  return (
    <Link
      href="/guide"
      className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]"
    >
      <div>
        <p className="tll-display text-[26px] leading-7 text-white">Guides</p>
        <p className="mt-2 text-sm leading-5 text-lab-muted">How to research supplements with confidence.</p>
      </div>
      <span className="mt-5 border-t border-lab-border pt-3 text-xs font-semibold text-lab-lime group-hover:underline">Read guides →</span>
    </Link>
  )
}

function LiftAppTile() {
  return (
    <a
      href="https://trylift.app"
      target="_blank"
      rel="noopener noreferrer"
      className="group flex min-h-36 flex-col justify-between rounded-xl border border-lab-border bg-lab-panel p-4 transition-colors hover:border-[#7c7e72]"
    >
      <div>
        <p className="tll-display text-[26px] leading-7 text-white">LIFT App</p>
        <p className="mt-2 text-sm leading-5 text-lab-muted">Free iPhone beta for training, nutrition and recovery.</p>
      </div>
      <span className="mt-5 border-t border-lab-border pt-3 text-xs font-semibold text-lab-lime group-hover:underline">Get the app ↗</span>
    </a>
  )
}

export default function CategoryGrid() {
  const [stats, setStats] = useState<Record<string, GroupStats>>({})

  useEffect(() => {
    fetch('/api/products?sort=score')
      .then((response) => response.json())
      .then((products: ScoredProduct[]) => {
        const computed: Record<string, GroupStats> = {}
        for (const group of CATEGORY_GROUPS) {
          const matches = products.filter((product) => group.categories.includes(product.category))
          const scores = matches.filter(hasApprovedAssessment).map((product) => product.score)
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {CATEGORY_GROUPS.map((group) => (
        <TileCard key={group.slug} group={group} stats={stats[group.slug]} />
      ))}
      <GuideTile />
      <LiftAppTile />
    </div>
  )
}
