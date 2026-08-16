'use client'

import { useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import {
  PEP_ITEMS,
  TIER_META,
  GROUP_META,
  itemsInGroup,
  type PepGroup,
  type PepItem,
} from '@/lib/peptides'

type Filter = 'all' | PepGroup

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'food', label: GROUP_META.food.label },
  { key: 'licensed', label: GROUP_META.licensed.label },
  { key: 'research', label: GROUP_META.research.label },
  { key: 'cosmetic', label: GROUP_META.cosmetic.label },
]

// Interactive board. All content is also rendered server-side in the page for
// crawlers/FAQ schema; this component only layers filtering + expand and the GA4
// events on top of the same data, so nothing here is required to read it.
export default function PeptidesBoard() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)

  const visible = itemsInGroup(filter)

  function pickFilter(key: Filter) {
    setFilter(key)
    track('peptides_filter', { filter: key })
  }

  function toggle(item: PepItem) {
    const next = open === item.id ? null : item.id
    setOpen(next)
    if (next) track('peptide_toggle', { item: item.id, tier: item.tier })
  }

  return (
    <div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count = key === 'all' ? PEP_ITEMS.length : itemsInGroup(key).length
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickFilter(key)}
              className="text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-colors"
              style={
                active
                  ? { background: '#a6e22e', color: '#0d0d0d' }
                  : { border: '1px solid rgba(255,255,255,0.14)', color: '#a3a3a3' }
              }
            >
              {label} <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* item cards */}
      <div className="space-y-3">
        {visible.map((item) => {
          const isOpen = open === item.id
          const tier = TIER_META[item.tier]
          return (
            <div
              key={item.id}
              id={item.id}
              className="bg-lab-panel border rounded-2xl overflow-hidden transition-colors"
              style={{ borderColor: isOpen ? `${tier.color}66` : 'rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => toggle(item)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 flex items-start gap-4"
              >
                {/* tier badge */}
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}66`, minWidth: 108, textAlign: 'center' }}
                >
                  {tier.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-1">
                    {item.topic}
                  </span>
                  <span className="block text-base sm:text-lg font-black text-white leading-tight">
                    {item.name}
                  </span>
                  {!isOpen && (
                    <span className="block text-sm text-white/70 leading-snug mt-1.5">{item.headline}</span>
                  )}
                </span>
                <span
                  className="shrink-0 text-2xl leading-none font-black transition-transform"
                  style={{ color: tier.color, transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  aria-hidden
                >
                  +
                </span>
              </button>

              {/* Always in the DOM (toggled with `hidden`) so the detail text
                  ships in the server HTML for crawlers and backs the FAQ schema. */}
              <div className="px-5 pb-5 -mt-1" hidden={!isOpen}>
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed text-white/85 space-y-4"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  {/* the pitch */}
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-muted">
                      The pitch
                    </span>
                    <p className="text-white/70 italic">{item.claim}</p>
                  </div>

                  <p>{item.detail}</p>

                  {/* bottom line */}
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-lime">
                      Bottom line
                    </span>
                    <p className="text-white/80">{item.bottomLine}</p>
                  </div>

                  {item.link && (
                    <Link
                      href={item.link.href}
                      onClick={() => track('peptides_cta', { item: item.id, href: item.link!.href })}
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-lab-lime hover:underline"
                    >
                      {item.link.label} <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-lab-muted text-sm py-10">Nothing in that category.</p>
      )}
    </div>
  )
}
