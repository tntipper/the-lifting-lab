'use client'

import { useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import { MYTHS, VERDICT_META, verdictCounts, type Verdict, type Myth } from '@/lib/myths'

type Filter = 'all' | Verdict

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'myth', label: 'Myths' },
  { key: 'partly', label: 'Half True' },
  { key: 'true', label: 'True' },
]

// Interactive myth board. All content is also rendered server-side in the page
// for crawlers/FAQ schema; this component only layers filtering + expand and the
// GA4 events on top of the same data, so nothing here is required to read it.
export default function MythBuster() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)
  const counts = verdictCounts()

  const visible = MYTHS.filter((m) => filter === 'all' || m.verdict === filter)

  function pickFilter(key: Filter) {
    setFilter(key)
    track('myths_filter', { filter: key })
  }

  function toggle(m: Myth) {
    const next = open === m.id ? null : m.id
    setOpen(next)
    if (next) track('myth_reveal', { myth: m.id, verdict: m.verdict })
  }

  return (
    <div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count =
            key === 'all' ? MYTHS.length : counts[key as Verdict]
          const accent = key === 'all' ? '#a6e22e' : VERDICT_META[key as Verdict].color
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

      {/* myth cards */}
      <div className="space-y-3">
        {visible.map((m) => {
          const v = VERDICT_META[m.verdict]
          const isOpen = open === m.id
          return (
            <div
              key={m.id}
              id={m.id}
              className="bg-lab-panel border rounded-2xl overflow-hidden transition-colors"
              style={{ borderColor: isOpen ? `${v.color}66` : 'rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => toggle(m)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 flex items-start gap-4"
              >
                {/* verdict badge */}
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${v.color}22`, color: v.color, border: `1px solid ${v.color}66` }}
                >
                  {v.label}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-1">
                    {m.topic}
                  </span>
                  <span className="block text-base sm:text-lg font-black text-white leading-tight">
                    &ldquo;{m.claim}&rdquo;
                  </span>
                  {!isOpen && (
                    <span className="block text-sm text-white/70 leading-snug mt-1.5">
                      {m.takeaway}
                    </span>
                  )}
                </span>
                <span
                  className="shrink-0 text-2xl leading-none font-black transition-transform"
                  style={{ color: v.color, transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  aria-hidden
                >
                  +
                </span>
              </button>

              {/* Always in the DOM (toggled with `hidden`) so the reality text
                  ships in the server HTML for crawlers and backs the FAQ schema. */}
              <div className="px-5 pb-5 -mt-1" hidden={!isOpen}>
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed text-white/85"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <span
                    className="block text-[10px] uppercase tracking-widest font-black mb-2"
                    style={{ color: v.color }}
                  >
                    The reality
                  </span>
                  {m.reality}
                  {m.link && (
                    <Link
                      href={m.link.href}
                      onClick={() => track('myth_cta', { myth: m.id, href: m.link!.href })}
                      className="inline-flex items-center gap-1 mt-3 text-xs font-bold uppercase tracking-widest text-lab-lime hover:underline"
                    >
                      {m.link.label} <span aria-hidden>→</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {visible.length === 0 && (
        <p className="text-center text-lab-muted text-sm py-10">
          Nothing in that category.
        </p>
      )}
    </div>
  )
}
