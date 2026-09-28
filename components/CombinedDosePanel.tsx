'use client'

import { NUTRIENT_LIMITS } from '@/lib/nutrient-limits'
import { convertAmount, referenceRangeFor } from '@/lib/stack-reference-ranges'

type DoseTotal = {
  name: string
  amount: number
  unit: string
  ulPercent: number | null
  rdaPercent: number | null
}

function formatAmount(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100)
}

export default function CombinedDosePanel({ totals }: { totals: DoseTotal[] }) {
  return <section className="rounded-xl border border-[#d7d8cf] bg-white p-5 text-[#14140f] sm:p-6">
    <h2 className="tll-display text-3xl uppercase">Combined daily dose</h2>
    <p className="mt-1 text-sm text-[#66685f]">Everything in your stack, added together against published reference ranges and safety limits where available.</p>

    {totals.length === 0 ? <p className="mt-6 rounded-lg bg-[#f1f1ec] p-4 text-sm text-[#66685f]">Add products with recorded ingredient amounts to see this comparison.</p> : <div className="mt-5 divide-y divide-[#dedfd7]">
      {totals.map(total => {
        const reference = referenceRangeFor(total.name)
        const amountInReferenceUnit = reference ? convertAmount(total.amount, total.unit, reference.unit) : null
        const upperLimit = NUTRIENT_LIMITS[total.name]
        const ulInReferenceUnit = reference && upperLimit?.ul != null
          ? convertAmount(upperLimit.ul, upperLimit.unit, reference.unit)
          : null
        const scaleMax = reference && amountInReferenceUnit != null
          ? Math.max(reference.maximum * 1.5, amountInReferenceUnit * 1.15, ulInReferenceUnit ?? 0)
          : 0
        const rangeStart = reference ? Math.min(100, reference.minimum / scaleMax * 100) : 0
        const rangeWidth = reference ? Math.max(2, (reference.maximum - reference.minimum) / scaleMax * 100) : 0
        const marker = reference && amountInReferenceUnit != null ? Math.min(99, amountInReferenceUnit / scaleMax * 100) : 0
        const status = !reference || amountInReferenceUnit == null ? 'Reference range unavailable'
          : amountInReferenceUnit < reference.minimum ? 'Below reference range'
          : amountInReferenceUnit > reference.maximum ? 'Above reference range'
          : 'Within reference range'

        return <article key={`${total.name}-${total.unit}`} className="py-4 first:pt-0 last:pb-0">
          <div className="flex items-baseline justify-between gap-4">
            <div className="min-w-0"><h3 className="truncate text-sm font-black">{total.name}</h3></div>
            <p className="shrink-0 font-mono text-sm font-black">{formatAmount(total.amount)} {total.unit} a day</p>
          </div>

          {reference && amountInReferenceUnit != null ? <>
            <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-[#e7e8e1]" role="meter" aria-label={`${total.name}: ${formatAmount(total.amount)} ${total.unit}; ${status.toLowerCase()}`} aria-valuemin={0} aria-valuemax={scaleMax} aria-valuenow={amountInReferenceUnit}>
              <span className="absolute inset-y-0 rounded-full bg-[#b7e95a]" style={{ left: `${rangeStart}%`, width: `${rangeWidth}%` }} />
              {ulInReferenceUnit != null && ulInReferenceUnit < scaleMax && <span aria-hidden="true" className="absolute inset-y-0 right-0" style={{ left: `${ulInReferenceUnit / scaleMax * 100}%`, background: 'repeating-linear-gradient(135deg, transparent 0 4px, #a7a99f 4px 6px)' }} />}
              <span aria-hidden="true" className="absolute -top-1 h-5 w-1 rounded bg-[#14140f]" style={{ left: `calc(${marker}% - 2px)` }} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#66685f]">
              <span className={`rounded-full border px-2 py-0.5 font-bold ${status === 'Within reference range' ? 'border-[#77a72a] bg-[#edf7da] text-[#486713]' : 'border-[#b0b2a8] bg-[#f1f1ec]'}`}>{status}</span>
              <span>{formatAmount(reference.minimum)}{reference.minimum === reference.maximum ? '' : `–${formatAmount(reference.maximum)}`} {reference.unit} {reference.timing}</span>
              {reference.context && <span>{reference.context}</span>}
            </div>
          </> : <p className="mt-2 text-xs text-[#77796f]">Reference range unavailable — the recorded amount is still included in your total.</p>}
        </article>
      })}
    </div>}

    <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-t border-[#d7d8cf] pt-4 text-[10px] text-[#66685f]">
      <span className="inline-flex items-center gap-1.5"><i className="h-2 w-5 rounded bg-[#b7e95a]" /> Published reference range</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-4 w-1 rounded bg-[#14140f]" /> Your recorded total</span>
      <span className="inline-flex items-center gap-1.5"><i className="h-3 w-5" style={{ background: 'repeating-linear-gradient(135deg, transparent 0 4px, #a7a99f 4px 6px)' }} /> Above established safety limit</span>
    </div>
    <p className="mt-3 text-[10px] leading-relaxed text-[#77796f]">Ranges are general published guidance, not a personal prescription or a product effectiveness score. Some needs vary by body weight, diet, health and training. Tap an ingredient in the research library for context.</p>
  </section>
}
