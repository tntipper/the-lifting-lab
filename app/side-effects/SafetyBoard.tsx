'use client'

import { useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import { SAFETY, TIER_META, tierCounts, type SafetyTier, type Safety } from '@/lib/side-effects'

type Filter = 'all' | SafetyTier

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'well-tolerated', label: 'Well Tolerated' },
  { key: 'use-sensibly', label: 'Use Sensibly' },
  { key: 'caution', label: 'Real Caution' },
]

// Interactive safety board. All content is also rendered server-side in the page
// for crawlers/FAQ schema; this component only layers filtering + expand and the
// GA4 events on top of the same data, so nothing here is required to read it.
export default function SafetyBoard() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const counts = tierCounts()

  const visible = SAFETY.filter((s) => filter === 'all' || s.tier === filter)

  function pickFilter(key: Filter) {
    setFilter(key)
    track('side_effects_filter', { filter: key })
  }

  function toggle(s: Safety) {
    const next = open === s.id ? null : s.id
    setOpen(next)
    if (next) track('side_effect_toggle', { supplement: s.id, tier: s.tier })
  }

  return (
    <div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count = key === 'all' ? SAFETY.length : counts[key as SafetyTier]
          const accent = key === 'all' ? '#a6e22e' : TIER_META[key as SafetyTier].color
          return (
            <button
              key={key}
              type="button"
              onClick={() => pickFilter(key)}
              className="text-[11px] font-black uppercase tracking-widest px-4 py-2 rounded-lg transition-colors"
              style={
                active
                  ? { background: accent, color: '#0d0d0d' }
                  : { border: '1px solid rgba(255,255,255,0.14)', color: '#a3a3a3' }
              }
            >
              {label} <span style={{ opacity: 0.7 }}>{count}</span>
            </button>
          )
        })}
      </div>

      {/* safety cards */}
      <div className="space-y-3">
        {visible.map((s) => {
          const t = TIER_META[s.tier]
          const isOpen = open === s.id
          return (
            <div
              key={s.id}
              id={s.id}
              className="bg-lab-panel border rounded-2xl overflow-hidden transition-colors"
              style={{ borderColor: isOpen ? `${t.color}66` : 'rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => toggle(s)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 flex items-start gap-4"
              >
                {/* tier badge */}
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${t.color}22`, color: t.color, border: `1px solid ${t.color}66` }}
                >
                  {t.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-1">
                    {s.topic}
                  </span>
                  <span className="block text-base sm:text-lg font-black text-white leading-tight">
                    {s.name}
                  </span>
                  {!isOpen && (
                    <span className="block text-sm text-white/70 leading-snug mt-1.5">
                      {s.headline}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 text-2xl leading-none font-black transition-transform"
                  style={{ color: t.color, transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  aria-hidden
                >
                  +
                </span>
              </button>

              {/* Always in the DOM (toggled with `hidden`) so the safety text ships
                  in the server HTML for crawlers and backs the FAQ schema. */}
              <div className="px-5 pb-5 -mt-1" hidden={!isOpen}>
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed text-white/85 space-y-4"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <p>{s.detail}</p>

                  <SafetyList title="Common side effects" color="#f5a623" items={s.common} />
                  <SafetyList title="Rare but serious" color="#e05a2b" items={s.serious} />
                  <SafetyList title="Who should be careful" color="#a6e22e" items={s.avoid} />

                  <div>
                    <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-lime">
                      Sensible use
                    </span>
                    <p className="text-white/80">{s.safeDose}</p>
                  </div>

                  {s.link && (
                    <Link
                      href={s.link.href}
                      onClick={() => track('side_effects_cta', { supplement: s.id, href: s.link!.href })}
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-lab-lime hover:underline"
                    >
                      {s.link.label} <span aria-hidden>→</span>
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

function SafetyList({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div>
      <span className="block text-[10px] uppercase tracking-widest font-black mb-1.5" style={{ color }}>
        {title}
      </span>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-white/80">
            <span aria-hidden style={{ color }} className="shrink-0 font-black">
              •
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
