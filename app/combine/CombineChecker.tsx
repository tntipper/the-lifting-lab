'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'
import {
  SUPPLEMENTS,
  SUPPLEMENT_BY_KEY,
  evaluateCombo,
  type ComboLevel,
} from '@/lib/combos'

const LEVEL_STYLE: Record<ComboLevel, { color: string; ring: string; label: string }> = {
  good: { color: '#a6e22e', ring: 'rgba(166,226,46,0.5)', label: 'Fine together' },
  watch: { color: '#e0a340', ring: 'rgba(224,163,64,0.5)', label: 'Watch' },
  caution: { color: '#e5533c', ring: 'rgba(229,83,60,0.5)', label: 'Caution' },
}

// Sensible default so the tool shows a real result on load rather than an
// empty state: the single most-searched combo plus a redundancy example.
const DEFAULT_SELECTED = ['creatine', 'pre-workout', 'whey']

export default function CombineChecker() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED)

  const result = useMemo(() => evaluateCombo(selected), [selected])

  function toggle(key: string) {
    setSelected((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
      track('combine_select', { supplement: key, selected: next.length })
      return next
    })
  }

  const hasResult = selected.length >= 2

  return (
    <div>
      {/* picker */}
      <p className="text-[11px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
        Select what you take
      </p>
      <div className="flex flex-wrap gap-2 mb-8">
        {SUPPLEMENTS.map((s) => {
          const on = selected.includes(s.key)
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => toggle(s.key)}
              aria-pressed={on}
              title={s.blurb}
              className="text-xs font-bold uppercase tracking-wide rounded-full px-3.5 py-2 transition-all"
              style={
                on
                  ? { background: '#a6e22e', color: '#0d0d0d', boxShadow: '0 0 12px rgba(166,226,46,0.35)' }
                  : { background: '#161616', color: '#c9c9c9', border: '1px solid #262626' }
              }
            >
              {s.label}
            </button>
          )
        })}
      </div>

      {!hasResult ? (
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-6 text-center">
          <p className="text-lab-muted text-sm">
            Pick at least two supplements above to check how they combine.
          </p>
        </div>
      ) : (
        <>
          {/* aggregate flags first — the important safety messages */}
          {result.flags.length > 0 && (
            <div className="space-y-3 mb-6">
              {result.flags.map((f) => {
                const st = LEVEL_STYLE[f.level]
                return (
                  <div
                    key={f.title}
                    className="rounded-2xl p-5"
                    style={{ background: '#161616', border: `1px solid ${st.ring}` }}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span
                        className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ background: st.color, color: '#0d0d0d' }}
                      >
                        {st.label}
                      </span>
                      <h3 className="text-sm font-black uppercase tracking-wide text-white">{f.title}</h3>
                    </div>
                    <p className="text-sm text-lab-muted leading-relaxed">{f.note}</p>
                  </div>
                )
              })}
            </div>
          )}

          {/* summary line */}
          <div className="flex flex-wrap items-center gap-3 mb-4 text-[11px] uppercase tracking-widest font-bold">
            <span className="text-lab-muted">
              {result.pairs.length} pair{result.pairs.length === 1 ? '' : 's'}
            </span>
            {result.summary.good > 0 && (
              <span style={{ color: LEVEL_STYLE.good.color }}>{result.summary.good} fine</span>
            )}
            {result.summary.watch > 0 && (
              <span style={{ color: LEVEL_STYLE.watch.color }}>{result.summary.watch} watch</span>
            )}
            {result.summary.caution > 0 && (
              <span style={{ color: LEVEL_STYLE.caution.color }}>{result.summary.caution} caution</span>
            )}
          </div>

          {/* pairwise verdicts */}
          <div className="space-y-2.5">
            {result.pairs.map((p) => {
              const st = LEVEL_STYLE[p.level]
              const a = SUPPLEMENT_BY_KEY[p.a]?.label ?? p.a
              const b = SUPPLEMENT_BY_KEY[p.b]?.label ?? p.b
              return (
                <div
                  key={`${p.a}|${p.b}`}
                  className="bg-lab-panel rounded-2xl p-5"
                  style={{ border: '1px solid #262626', borderLeft: `3px solid ${st.color}` }}
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <p className="text-sm font-black uppercase tracking-wide text-white">
                      {a} <span className="text-lab-muted">+</span> {b}
                    </p>
                    <span
                      className="text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded shrink-0"
                      style={{ background: st.color, color: '#0d0d0d' }}
                    >
                      {st.label}
                    </span>
                  </div>
                  <p className="text-sm text-lab-muted leading-relaxed">{p.note}</p>
                </div>
              )
            })}
          </div>

          <p className="text-lab-muted/70 text-[11px] leading-relaxed mt-6">
            Checks supplement-with-supplement combining for healthy adults only. It does not cover interactions with
            medication or health conditions — if that applies to you, ask a pharmacist or doctor first.
          </p>
        </>
      )}
    </div>
  )
}
