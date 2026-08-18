'use client'

import { useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import {
  DOSE_ITEMS,
  TIER_META,
  GROUP_META,
  itemsInGroup,
  type DoseGroup,
  type DoseItem,
} from '@/lib/dosage'

type Filter = 'all' | DoseGroup

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'performance', label: GROUP_META.performance.label },
  { key: 'protein', label: GROUP_META.protein.label },
  { key: 'vitamins', label: GROUP_META.vitamins.label },
  { key: 'recovery', label: GROUP_META.recovery.label },
]

// Interactive dosage board. All content is also rendered server-side in the page
// for crawlers/FAQ schema; this component only layers filtering + expand and the
// GA4 events on top of the same data, so nothing here is required to read it.
export default function DosageBoard() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)

  const visible = itemsInGroup(filter)

  function pickFilter(key: Filter) {
    setFilter(key)
    track('dosage_filter', { filter: key })
  }

  function toggle(item: DoseItem) {
    const next = open === item.id ? null : item.id
    setOpen(next)
    if (next) track('dosage_toggle', { item: item.id, tier: item.tier })
  }

  return (
    <div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count = key === 'all' ? DOSE_ITEMS.length : itemsInGroup(key).length
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
                  style={{ background: `${tier.color}22`, color: tier.color, border: `1px solid ${tier.color}66`, minWidth: 92, textAlign: 'center' }}
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
                  {/* dose + timing are the point of this page, so they show on the collapsed card */}
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 mt-1.5">
                    <span className="text-sm font-black" style={{ color: tier.color }}>
                      {item.dose}
                    </span>
                    <span className="text-xs text-white/60">{item.timing}</span>
                  </span>
                </span>
                <span
                  className="shrink-0 text-2xl leading-none font-black transition-transform"
                  style={{ color: tier.color, transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  aria-hidden
                >
                  +
                </span>
              </button>

              {/* Always in the DOM (toggled with `hidden`) so the detail text ships
                  in the server HTML for crawlers and backs the FAQ schema. */}
              <div className="px-5 pb-5 -mt-1" hidden={!isOpen}>
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed text-white/85 space-y-4"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  {/* dose / timing / form quick facts */}
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-muted">
                        Dose
                      </span>
                      <p className="text-white font-bold">{item.dose}</p>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-muted">
                        Timing
                      </span>
                      <p className="text-white/90">{item.timing}</p>
                    </div>
                    <div>
                      <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-muted">
                        Form
                      </span>
                      <p className="text-white/80 text-[13px] leading-snug">{item.form}</p>
                    </div>
                  </div>

                  <p>{item.detail}</p>

                  {/* the honest ceiling — the differentiator */}
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-lime">
                      More is not better
                    </span>
                    <p className="text-white/80">{item.ceiling}</p>
                  </div>

                  {item.link && (
                    <Link
                      href={item.link.href}
                      onClick={() => track('dosage_cta', { item: item.id, href: item.link!.href })}
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
