'use client'

import { useState } from 'react'
import { methodologyFor } from '@/lib/methodology'
import { categoryLabel } from '@/lib/categories'

export default function MethodologyModal({ category }: { category?: string }) {
  const [open, setOpen] = useState(false)
  const method = methodologyFor(category)
  const catLabel = category ? categoryLabel(category) : null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-bold text-lab-lime hover:underline uppercase tracking-widest shrink-0"
      >
        ⓘ How we score
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div className="w-full max-w-md bg-lab-bg border border-lab-border rounded-2xl p-5 max-h-[90dvh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-lg font-black uppercase italic">
                How We <span className="text-lab-lime">Score</span>
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-lab-muted text-xl leading-none px-2 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-sm text-white/80 leading-relaxed">
              <p>
                Every product gets an <span className="text-white font-bold">Effectiveness Match score (0–100)</span> —
                a dose-for-dose comparison against a category-specific &quot;ideal&quot; reference spec built from
                peer-reviewed evidence.
              </p>

              {method && (
                <div className="rounded-xl border border-lab-lime/30 bg-lab-lime/5 p-3">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-lab-lime mb-1.5">
                    The perfect {catLabel?.toLowerCase()} · weighting
                  </p>
                  <p className="text-[11px] text-white/80 leading-relaxed mb-3">{method.blurb}</p>
                  <div className="space-y-1.5">
                    {method.rows.map((row) => (
                      <div
                        key={row.ingredient}
                        className="flex items-center gap-2 bg-black/40 border border-lab-border rounded-lg px-3 py-2"
                      >
                        <span className="text-[11px] font-bold flex-1 min-w-0">{row.ingredient}</span>
                        <span className="text-[11px] text-lab-muted shrink-0">{row.target}</span>
                        <span className="text-[11px] font-black text-lab-lime w-14 text-right shrink-0">{row.weight}</span>
                      </div>
                    ))}
                  </div>
                  {method.notes.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                      {method.notes.map((note, i) => (
                        <li key={i} className="text-[11px] text-white/70 flex gap-1.5">
                          <span className="text-lab-lime shrink-0">•</span>
                          <span>{note}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">The score breakdown</p>
                <div className="space-y-2">
                  <div className="flex gap-2 text-[11px]">
                    <span className="shrink-0 text-lab-lime">🏆</span>
                    <span><span className="text-white font-bold">Best Effectiveness Match</span> — ranked purely by score. Closest to the ideal reference spec wins.</span>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <span className="shrink-0 text-lab-lime">💰</span>
                    <span><span className="text-white font-bold">Best Value for Score</span> — ranked by score per £ per serving. Highest quality relative to what you pay.</span>
                  </div>
                  <div className="flex gap-2 text-[11px]">
                    <span className="shrink-0 text-lab-lime">🎯</span>
                    <span><span className="text-white font-bold">Budget Pick</span> — cheapest per serving among products scoring ≥50. You see the trade-off clearly.</span>
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">How the winner is chosen</p>
                <p className="text-[11px]">
                  🥇 goes to the highest-scoring product in its category. No sponsored placements. No paid rankings.
                  The same formula that scores every other product determines who wins.
                </p>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">Ingredient colours</p>
                <div className="flex gap-3 flex-wrap">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lab-lime/10 text-lab-lime border border-lab-lime/30">● Green = meets effective dose</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">● Amber = below optimal</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">● Red = significantly underdosed</span>
                </div>
              </div>

              <div className="rounded-xl border border-lab-border bg-white/5 p-3">
                <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-1.5">What the score is — and isn&apos;t</p>
                <p className="text-[11px] text-white/80 leading-relaxed">
                  Scores rate a product&apos;s <span className="text-white font-bold">ingredients and doses</span> against
                  a category ideal — nothing else. A score is <span className="text-white font-bold">not</span> a
                  judgement of the brand, its quality, safety, manufacturing, or reputation. A lower score reflects
                  the <span className="italic">formulation</span> we measured, not the company behind it.
                </p>
              </div>

              <p className="text-[10px] text-lab-muted border-t border-lab-border pt-3">
                Every product is scored as a % match against a defined ideal for its category — dose-for-dose,
                no commission bias. The perfect 100 belongs to an ideal that doesn&apos;t exist, so real products
                land below it. <span className="font-bold">Informational only — not medical advice.</span>
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
