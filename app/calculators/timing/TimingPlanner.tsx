'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { track } from '@/lib/gtag'

const AR = '166,226,46'

type BlockId = 'wake' | 'pre' | 'post' | 'dinner' | 'bed'
type TrainTime = 'am' | 'midday' | 'pm'
type Tag = 'critical' | 'helpful' | 'myth'

type Supp = {
  id: string
  label: string
  block: BlockId
  tag: Tag
  why: string
  href: string
  cta: string
  stim?: boolean
}

// Evidence-based timing map. Each supplement is slotted into the daily block
// where the evidence actually puts it, with an honest tag on whether timing
// changes the result at all. Zero DB — pure static logic.
const SUPPS: Supp[] = [
  { id: 'creatine', label: 'Creatine', block: 'post', tag: 'myth',
    why: 'Timing is basically a myth — 3 to 5g every single day is what saturates your muscles. Take it whenever you will actually remember; anchoring it to your post-workout shake is just a convenient habit.',
    href: '/calculators/creatine', cta: 'Creatine calculator' },
  { id: 'whey', label: 'Whey protein', block: 'post', tag: 'helpful',
    why: 'Handy right after training, but the anabolic window is hours wide. Hitting your total daily protein matters far more than the shake landing post-workout.',
    href: '/guide/whey', cta: 'Whey guide' },
  { id: 'pre-workout', label: 'Pre-workout', block: 'pre', tag: 'critical', stim: true,
    why: 'Take it 30 to 45 minutes before you lift so the caffeine and pump ingredients peak as your first working set starts.',
    href: '/best/pre-workout', cta: 'Best pre-workout' },
  { id: 'caffeine', label: 'Caffeine', block: 'pre', tag: 'critical', stim: true,
    why: 'Blood levels peak about 45 to 60 minutes after you take it, so dose it pre-workout — and watch the sleep cut-off if you train late.',
    href: '/calculators/caffeine', cta: 'Caffeine calculator' },
  { id: 'citrulline', label: 'Citrulline', block: 'pre', tag: 'critical',
    why: 'Its blood-flow and pump effect is acute, so take a full 6 to 8g about 45 to 60 minutes before training. No point dosing it on rest days.',
    href: '/calculators/citrulline', cta: 'Citrulline calculator' },
  { id: 'beta-alanine', label: 'Beta-alanine', block: 'wake', tag: 'myth',
    why: 'It works by saturating over weeks, so the time of day is irrelevant. Split the daily dose across meals to keep the harmless tingle in check.',
    href: '/calculators/beta-alanine', cta: 'Beta-alanine calculator' },
  { id: 'eaas', label: 'EAAs / BCAAs', block: 'pre', tag: 'helpful',
    why: 'Useful sipped around training if you lift fasted or your daily protein runs low. If protein is already high, they are largely redundant.',
    href: '/guide/eaas', cta: 'EAA guide' },
  { id: 'casein', label: 'Casein protein', block: 'bed', tag: 'helpful',
    why: 'A slow-digesting protein that drip-feeds amino acids overnight — the one protein where before-bed timing has a small, logical edge.',
    href: '/guide/casein', cta: 'Casein guide' },
  { id: 'vitamin-d', label: 'Vitamin D', block: 'wake', tag: 'helpful',
    why: 'Fat-soluble, so take it with the day’s largest fatty meal for absorption. Morning avoids any chance of it nudging your sleep.',
    href: '/guide/vitamin-d', cta: 'Vitamin D guide' },
  { id: 'multivitamin', label: 'Multivitamin', block: 'wake', tag: 'helpful',
    why: 'Take with breakfast — the fat-soluble vitamins (A, D, E, K) absorb far better alongside food than on an empty stomach.',
    href: '/guide/multivitamin', cta: 'Multivitamin guide' },
  { id: 'omega-3', label: 'Omega-3 / fish oil', block: 'dinner', tag: 'helpful',
    why: 'Take with a meal that contains fat to absorb it properly and cut the fishy repeat. Splitting the dose AM and PM also helps if it is large.',
    href: '/products?q=omega', cta: 'Browse omega-3' },
  { id: 'zma', label: 'ZMA / magnesium', block: 'bed', tag: 'helpful',
    why: 'Magnesium supports relaxation and sleep, so before bed suits it. Keep ZMA away from calcium and dairy, which blunt zinc and magnesium uptake.',
    href: '/guide/zma', cta: 'ZMA guide' },
  { id: 'electrolytes', label: 'Electrolytes', block: 'pre', tag: 'helpful',
    why: 'Best around training and across the day to stay hydrated — match it to sweat loss and long sessions rather than a fixed clock time.',
    href: '/guide/hydration', cta: 'Hydration guide' },
]

const DEFAULT_SELECTED = ['creatine', 'whey', 'pre-workout', 'vitamin-d']

const BLOCKS: { id: BlockId; label: string; time: string }[] = [
  { id: 'wake', label: 'On waking / breakfast', time: 'Morning, with food' },
  { id: 'pre', label: 'Pre-workout', time: '30–60 min before you train' },
  { id: 'post', label: 'Post-workout', time: 'Within an hour after' },
  { id: 'dinner', label: 'With your evening meal', time: 'Dinner' },
  { id: 'bed', label: 'Before bed', time: '30–60 min before sleep' },
]

const TIMES: { id: TrainTime; label: string; sub: string }[] = [
  { id: 'am', label: 'Morning', sub: 'Before ~11am' },
  { id: 'midday', label: 'Midday', sub: '~11am–5pm' },
  { id: 'pm', label: 'Evening', sub: 'After ~5pm' },
]

const TAG_META: Record<Tag, { label: string; color: string }> = {
  critical: { label: 'Timing matters', color: '#a6e22e' },
  helpful: { label: 'Timing helps', color: '#e5e5e5' },
  myth: { label: 'Timing is a myth', color: '#7dd3fc' },
}

export default function TimingPlanner() {
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTED)
  const [when, setWhen] = useState<TrainTime>('pm')

  function toggle(id: string) {
    setSelected((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      track('calculator_timing_toggle', { supp: id, on: !prev.includes(id) })
      return next
    })
  }

  const chosen = useMemo(() => SUPPS.filter((s) => selected.includes(s.id)), [selected])

  const schedule = useMemo(
    () => BLOCKS.map((b) => ({ ...b, items: chosen.filter((s) => s.block === b.id) })).filter((b) => b.items.length > 0),
    [chosen],
  )

  // Honest myth-buster tally.
  const criticalCount = chosen.filter((s) => s.tag === 'critical').length
  const mythCount = chosen.filter((s) => s.tag === 'myth').length

  // Evening stimulant + late training = a real sleep risk worth flagging.
  const stimLate = when === 'pm' && chosen.some((s) => s.stim)

  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl overflow-hidden">
      <div className="p-6">
        {/* supplement picker */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-3">
            What do you take? Tap to add
          </span>
          <div className="flex flex-wrap gap-2">
            {SUPPS.map((s) => {
              const on = selected.includes(s.id)
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggle(s.id)}
                  className="text-[12px] font-bold uppercase tracking-wide px-3.5 py-2 rounded-full border transition-colors"
                  style={on
                    ? { borderColor: `rgba(${AR},0.6)`, color: '#a6e22e', background: `rgba(${AR},0.08)` }
                    : { borderColor: '#262626', color: '#a3a3a3' }}
                >
                  {on ? '✓ ' : '+ '}{s.label}
                </button>
              )
            })}
          </div>
        </label>

        {/* training time */}
        <label className="block mb-6">
          <span className="block text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted mb-2">
            When do you usually train?
          </span>
          <div className="grid grid-cols-3 gap-2">
            {TIMES.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => { setWhen(t.id); track('calculator_timing', { when: t.id, count: selected.length }) }}
                className="text-left px-4 py-3 rounded-lg border transition-colors"
                style={when === t.id
                  ? { borderColor: `rgba(${AR},0.6)`, background: `rgba(${AR},0.08)` }
                  : { borderColor: '#262626' }}
              >
                <span
                  className="block text-[12px] font-black uppercase tracking-widest"
                  style={{ color: when === t.id ? '#a6e22e' : '#e5e5e5' }}
                >
                  {t.label}
                </span>
                <span className="block text-[11px] text-lab-muted mt-0.5">{t.sub}</span>
              </button>
            ))}
          </div>
        </label>

        {/* schedule */}
        {schedule.length === 0 ? (
          <div className="bg-lab-bg border border-lab-border rounded-xl p-6 text-center">
            <p className="text-sm text-lab-muted">Pick at least one supplement above to build your daily schedule.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-[10px] uppercase tracking-[0.25em] font-bold text-lab-muted">
              Your daily schedule
            </p>
            {schedule.map((b) => (
              <div key={b.id} className="bg-lab-bg border border-lab-border rounded-xl p-5">
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <p className="text-sm font-black uppercase tracking-wide text-white">{b.label}</p>
                  <p className="text-[11px] text-lab-muted whitespace-nowrap">
                    {b.id === 'pre'
                      ? (when === 'am' ? 'Morning session' : when === 'pm' ? 'Evening session' : 'Midday session') + ', ' + b.time
                      : b.time}
                  </p>
                </div>
                <div className="space-y-3">
                  {b.items.map((s) => (
                    <div key={s.id} className="border-t border-lab-border pt-3 first:border-t-0 first:pt-0">
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <p className="text-sm font-bold text-white/90">{s.label}</p>
                        <span
                          className="text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full border whitespace-nowrap"
                          style={{ color: TAG_META[s.tag].color, borderColor: TAG_META[s.tag].color + '55' }}
                        >
                          {TAG_META[s.tag].label}
                        </span>
                      </div>
                      <p className="text-[12px] text-lab-muted leading-snug">{s.why}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* evening-stimulant sleep warning */}
        {stimLate && (
          <div className="mt-4 rounded-xl p-5 border" style={{ borderColor: 'rgba(248,113,113,0.5)', background: 'rgba(248,113,113,0.06)' }}>
            <p className="text-sm font-black uppercase tracking-wide mb-1" style={{ color: '#f87171' }}>
              Watch your sleep
            </p>
            <p className="text-[12px] text-lab-muted leading-relaxed">
              You train in the evening and take a stimulant. Caffeine has a half-life of roughly 5 to 6 hours,
              so a pre-workout at 6pm still leaves about half of it in your system near midnight. If your sleep
              suffers, cap caffeine at least 8 hours before bed or switch to a stim-free pre-workout on late days.
            </p>
          </div>
        )}

        {/* myth-buster tally */}
        {chosen.length > 0 && (
          <div className="mt-4 bg-lab-bg border border-lab-border rounded-xl p-5">
            <p className="text-[12px] text-lab-muted leading-relaxed">
              Of your {chosen.length} pick{chosen.length === 1 ? '' : 's'},{' '}
              <span className="text-lab-lime font-bold">{criticalCount}</span>{' '}
              {criticalCount === 1 ? 'is' : 'are'} genuinely timing-sensitive
              {mythCount > 0 && (
                <>
                  {' '}and <span className="font-bold" style={{ color: '#7dd3fc' }}>{mythCount}</span> you can take
                  whenever fits your day
                </>
              )}
              . Most timing advice online is overblown — consistency and total daily intake beat the clock for
              almost everything except your pre-workout.
            </p>
          </div>
        )}

        {/* funnel */}
        <div className="grid grid-cols-2 gap-2 mt-5">
          <Link
            href="/wizard"
            onClick={() => track('calculator_cta', { tab: 'timing', target: 'wizard' })}
            className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg bg-lab-lime text-black hover:opacity-90 transition-all"
          >
            Build my stack
          </Link>
          <Link
            href="/calculators"
            onClick={() => track('calculator_cta', { tab: 'timing', target: 'calculators' })}
            className="text-center text-[11px] font-black uppercase tracking-widest px-5 py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white transition-all"
          >
            More calculators
          </Link>
        </div>
      </div>
    </div>
  )
}
