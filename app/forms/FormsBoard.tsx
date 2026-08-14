'use client'

import { useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import {
  FORMS,
  VERDICT_META,
  GROUP_META,
  familiesInGroup,
  type FormGroup,
  type FormFamily,
} from '@/lib/forms'

type Filter = 'all' | FormGroup

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'protein', label: GROUP_META.protein.label },
  { key: 'performance', label: GROUP_META.performance.label },
  { key: 'vitamins-minerals', label: GROUP_META['vitamins-minerals'].label },
  { key: 'herbals', label: GROUP_META.herbals.label },
]

// Interactive forms board. All content is also rendered server-side in the page
// for crawlers/FAQ schema; this component only layers filtering + expand and the
// GA4 events on top of the same data, so nothing here is required to read it.
export default function FormsBoard() {
  const [filter, setFilter] = useState<Filter>('all')
  const [open, setOpen] = useState<string | null>(null)

  const visible = familiesInGroup(filter)

  function pickFilter(key: Filter) {
    setFilter(key)
    track('forms_filter', { filter: key })
  }

  function toggle(f: FormFamily) {
    const next = open === f.id ? null : f.id
    setOpen(next)
    if (next) track('form_toggle', { supplement: f.id, group: f.group })
  }

  return (
    <div>
      {/* filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map(({ key, label }) => {
          const active = filter === key
          const count = key === 'all' ? FORMS.length : familiesInGroup(key).length
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

      {/* family cards */}
      <div className="space-y-3">
        {visible.map((f) => {
          const isOpen = open === f.id
          const accent = '#a6e22e'
          return (
            <div
              key={f.id}
              id={f.id}
              className="bg-lab-panel border rounded-2xl overflow-hidden transition-colors"
              style={{ borderColor: isOpen ? `${accent}66` : 'rgba(255,255,255,0.08)' }}
            >
              <button
                type="button"
                onClick={() => toggle(f)}
                aria-expanded={isOpen}
                className="w-full text-left p-5 flex items-start gap-4"
              >
                {/* pick badge */}
                <span
                  className="shrink-0 mt-0.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded"
                  style={{ background: `${accent}22`, color: accent, border: `1px solid ${accent}66` }}
                >
                  {f.pick}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-1">
                    {f.topic}
                  </span>
                  <span className="block text-base sm:text-lg font-black text-white leading-tight">
                    {f.name}
                  </span>
                  {!isOpen && (
                    <span className="block text-sm text-white/70 leading-snug mt-1.5">{f.headline}</span>
                  )}
                </span>
                <span
                  className="shrink-0 text-2xl leading-none font-black transition-transform"
                  style={{ color: accent, transform: isOpen ? 'rotate(45deg)' : 'none' }}
                  aria-hidden
                >
                  +
                </span>
              </button>

              {/* Always in the DOM (toggled with `hidden`) so the comparison text
                  ships in the server HTML for crawlers and backs the FAQ schema. */}
              <div className="px-5 pb-5 -mt-1" hidden={!isOpen}>
                <div
                  className="rounded-xl p-4 text-sm leading-relaxed text-white/85 space-y-4"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <p>{f.detail}</p>

                  {/* per-form verdicts */}
                  <ul className="space-y-2">
                    {f.options.map((o, i) => {
                      const v = VERDICT_META[o.verdict]
                      return (
                        <li key={i} className="flex gap-3">
                          <span
                            className="shrink-0 mt-0.5 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded self-start"
                            style={{ background: `${v.color}22`, color: v.color, border: `1px solid ${v.color}66`, minWidth: 78, textAlign: 'center' }}
                          >
                            {v.label}
                          </span>
                          <span className="min-w-0">
                            <span className="font-bold text-white">{o.name}</span>
                            <span className="text-white/70"> — {o.note}</span>
                          </span>
                        </li>
                      )
                    })}
                  </ul>

                  {/* bottom line */}
                  <div>
                    <span className="block text-[10px] uppercase tracking-widest font-black mb-1 text-lab-lime">
                      Bottom line
                    </span>
                    <p className="text-white/80">{f.bottomLine}</p>
                  </div>

                  {f.link && (
                    <Link
                      href={f.link.href}
                      onClick={() => track('forms_cta', { supplement: f.id, href: f.link!.href })}
                      className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-widest text-lab-lime hover:underline"
                    >
                      {f.link.label} <span aria-hidden>→</span>
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
