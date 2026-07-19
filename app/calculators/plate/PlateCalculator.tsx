'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

type Unit = 'kg' | 'lb'

const AR = '166,226,46'

const inputCls =
  'w-full bg-lab-bg border border-lab-border rounded-lg px-3 py-2.5 text-white text-sm ' +
  'focus:outline-none focus:border-lab-lime/60 transition-colors'

function num(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

// A loadable plate: its face value plus a chip colour. The kg values follow the
// IWF/IPF competition colour code (25 red, 20 blue, 15 yellow, 10 green, 5 white,
// 2.5 red, 1.25 chrome, small change plates grey), which is what lifters actually
// see on the bar. The lb set uses the common US colour convention.
type Plate = { value: number; bg: string; fg: string; ring?: string }

const PLATES: Record<Unit, Plate[]> = {
  kg: [
    { value: 25, bg: '#dc2626', fg: '#fff' },
    { value: 20, bg: '#2563eb', fg: '#fff' },
    { value: 15, bg: '#eab308', fg: '#000' },
    { value: 10, bg: '#16a34a', fg: '#fff' },
    { value: 5, bg: '#f5f5f5', fg: '#000' },
    { value: 2.5, bg: '#dc2626', fg: '#fff' },
    { value: 1.25, bg: '#d4d4d8', fg: '#000' },
    { value: 0.5, bg: '#71717a', fg: '#fff' },
    { value: 0.25, bg: '#52525b', fg: '#fff' },
  ],
  lb: [
    { value: 45, bg: '#2563eb', fg: '#fff' },
    { value: 35, bg: '#eab308', fg: '#000' },
    { value: 25, bg: '#16a34a', fg: '#fff' },
    { value: 10, bg: '#f5f5f5', fg: '#000' },
    { value: 5, bg: '#d4d4d8', fg: '#000' },
    { value: 2.5, bg: '#71717a', fg: '#fff' },
  ],
}

// Standard bar options per unit: Olympic men's / women's, or a training bar.
const BARS: Record<Unit, { value: number; label: string }[]> = {
  kg: [
    { value: 20, label: "20kg (men's Olympic)" },
    { value: 15, label: "15kg (women's Olympic)" },
    { value: 10, label: '10kg (training bar)' },
    { value: 0, label: 'No bar (0kg)' },
  ],
  lb: [
    { value: 45, label: "45lb (men's Olympic)" },
    { value: 35, label: "35lb (women's Olympic)" },
    { value: 15, label: '15lb (training bar)' },
    { value: 0, label: 'No bar (0lb)' },
  ],
}

// Greedy per-side load: plates are symmetric, so we fill (target - bar) / 2 from the
// largest plate down. Standard plate values divide cleanly, so greedy is optimal here.
// Returns the plates used per side (largest first) and any weight we could not make.
function loadPlates(perSide: number, plates: Plate[]) {
  const used: { plate: Plate; count: number }[] = []
  let remaining = Math.round(perSide * 100) / 100
  for (const plate of plates) {
    if (remaining < plate.value - 1e-9) continue
    const count = Math.floor((remaining + 1e-9) / plate.value)
    if (count > 0) {
      used.push({ plate, count })
      remaining = Math.round((remaining - count * plate.value) * 100) / 100
    }
  }
  return { used, leftover: Math.max(0, remaining) }
}

export default function PlateCalculator() {
  const [unit, setUnit] = useState<Unit>('kg')
  const [bar, setBar] = useState(20)
  const [target, setTarget] = useState('')

  // Keep the bar sensible when the unit flips (20kg <-> 45lb defaults).
  function switchUnit(u: Unit) {
    if (u === unit) return
    setUnit(u)
    setBar(BARS[u][0].value)
  }

  const result = useMemo(() => {
    const total = num(target)
    if (total <= 0) return null
    const plates = PLATES[unit]
    const smallest = plates[plates.length - 1].value
    if (total < bar) {
      return { belowBar: true as const, total }
    }
    const perSide = (total - bar) / 2
    const { used, leftover } = loadPlates(perSide, plates)
    const loadedPerSide = perSide - leftover
    const achievable = Math.round((bar + loadedPerSide * 2) * 100) / 100
    return {
      belowBar: false as const,
      total,
      perSide: Math.round(perSide * 100) / 100,
      used,
      leftover: Math.round(leftover * 100) / 100,
      achievable,
      exact: leftover < smallest / 2 && Math.abs(achievable - total) < 1e-6,
      empty: used.length === 0,
    }
  }, [target, bar, unit])

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* unit */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          {(['kg', 'lb'] as Unit[]).map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => switchUnit(u)}
              className="text-[11px] font-black uppercase tracking-widest py-2.5 rounded-lg border transition-colors"
              style={unit === u
                ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                : { borderColor: '#262626', color: '#a3a3a3' }}
            >
              {u === 'kg' ? 'Kilograms' : 'Pounds'}
            </button>
          ))}
        </div>

        {/* target weight */}
        <label className="block mb-5">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Target weight on the bar
          </span>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-center">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              placeholder={unit === 'kg' ? 'e.g. 100' : 'e.g. 225'}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              onBlur={() => track('calculator_plates', { unit, bar })}
              className={inputCls}
            />
            <span className="text-sm font-black uppercase tracking-widest text-lab-muted pr-1">{unit}</span>
          </div>
        </label>

        {/* bar weight */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            Bar weight
          </span>
          <select
            value={bar}
            onChange={(e) => setBar(Number(e.target.value))}
            className={inputCls + ' appearance-none'}
          >
            {BARS[unit].map((b) => (
              <option key={b.value} value={b.value}>{b.label}</option>
            ))}
          </select>
        </label>

        {result ? (
          result.belowBar ? (
            <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
              <p className="text-sm text-white/90 leading-snug">
                Your target of {result.total} {unit} is lighter than the {bar}{unit} bar. Drop to a
                lighter bar, or just work with the empty bar to start.
              </p>
            </div>
          ) : (
            <>
              <div className="bg-lab-bg border border-lab-border rounded-xl p-5">
                <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
                  Load per side
                </p>

                {result.empty ? (
                  <p className="text-sm text-white/90 leading-snug">
                    That is just the bar — no plates needed.
                  </p>
                ) : (
                  <>
                    {/* plate chips, largest first, in the order they slide on */}
                    <div className="flex flex-wrap items-center gap-2 mb-4">
                      {result.used.map(({ plate, count }) =>
                        Array.from({ length: count }).map((_, i) => (
                          <span
                            key={`${plate.value}-${i}`}
                            className="inline-flex items-center justify-center rounded-md text-xs font-black tabular-nums shadow-sm"
                            style={{
                              background: plate.bg,
                              color: plate.fg,
                              minWidth: 46,
                              height: 40,
                              padding: '0 8px',
                              border: '1px solid rgba(255,255,255,0.14)',
                            }}
                          >
                            {plate.value}
                          </span>
                        )),
                      )}
                    </div>

                    {/* per-side maths, plain English */}
                    <p className="text-sm text-white/90 leading-snug">
                      {result.used
                        .map(({ plate, count }) => `${count} x ${plate.value}${unit}`)
                        .join('  +  ')}
                      {' '}each side
                      <span className="text-lab-muted"> ({result.perSide}{unit} per side)</span>
                    </p>
                  </>
                )}

                <div className="mt-4 pt-3 border-t border-lab-border flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm text-white/90">
                      {result.exact ? 'Total on the bar' : 'Closest you can load'}
                    </p>
                    {!result.exact && (
                      <p className="text-[11px] text-lab-muted mt-0.5 leading-snug">
                        {result.leftover}{unit} per side short of {result.total}{unit} — no plate that
                        small in the set. Nearest is {result.achievable}{unit}.
                      </p>
                    )}
                  </div>
                  <p className="text-2xl font-black text-lab-lime tabular-nums whitespace-nowrap">
                    {result.achievable}{unit}
                  </p>
                </div>
              </div>

              {/* funnel — strength traffic to the tools + supplements that move the number */}
              <div className="grid grid-cols-2 gap-2 mt-5">
                <Link
                  href="/calculators/1rm"
                  onClick={() => track('calculator_cta', { tab: 'plate', target: '1rm' })}
                  className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
                >
                  1RM calculator
                </Link>
                <Link
                  href="/best/creatine"
                  onClick={() => track('calculator_cta', { tab: 'plate', target: 'creatine' })}
                  className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
                >
                  Best creatine 2026
                </Link>
              </div>
            </>
          )
        ) : (
          <p className="text-sm text-lab-muted">
            Enter the weight you want on the bar and pick your bar — we&apos;ll show the plates to slide
            on each side.
          </p>
        )}
      </div>
    </div>
  )
}
