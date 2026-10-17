'use client'

import { NUTRIENT_LIMITS } from '@/lib/nutrient-limits'
import { convertAmount, referenceRangeFor } from '@/lib/stack-reference-ranges'

export type DoseTotal = {
  name: string; amount: number; unit: string
  ulPercent?: number | null; rdaPercent?: number | null
  contributions?: { product: string; amount: number }[]
}
const formatAmount = (value: number) => String(Math.round(value * 100) / 100)
const position = (value: number, max: number) => Math.max(0, Math.min(100, value / max * 100))

export default function CombinedDosePanel({ totals }: { totals: DoseTotal[] }) {
  return <section className="dose-panel" aria-labelledby="combined-dose-heading">
    <h2 id="combined-dose-heading">Combined daily dose</h2>
    <p className="dose-intro">Everything in your stack, added up, against published evidence ranges and established guidance.</p>
    {totals.length === 0 ? <p className="dose-empty">Add products with recorded ingredient amounts to see this comparison.</p> : <div>
      {[...totals].sort((a, b) => a.name.localeCompare(b.name)).map(total => {
        const reference = referenceRangeFor(total.name)
        const upperLimit = NUTRIENT_LIMITS[total.name]
        const unit = reference?.unit ?? upperLimit?.unit ?? total.unit
        const amount = convertAmount(total.amount, total.unit, unit)
        const limit = upperLimit?.ul != null ? convertAmount(upperLimit.ul, upperLimit.unit, unit) : null
        const limitLabel = upperLimit ? upperLimit.limitLabel ?? 'EFSA UL' : null
        const limitStatus = limit !== null && amount !== null ? `${amount > limit ? 'Above' : amount === limit ? 'At' : 'Within'} ${limitLabel}` : null
        const above = limit !== null && amount !== null && amount > limit
        const status = above ? limitStatus! : !reference || amount === null ? limitStatus ?? 'Reference range unavailable'
          : reference.perSession ? 'Per-session range: compare one serving, not this daily total'
          : reference.context || reference.timing !== 'a day' ? 'Context-specific evidence range'
          : amount < reference.minimum ? 'Below evidence dose'
          : amount > reference.maximum ? 'Above evidence range' : 'Evidence dose'
        const max = Math.max((limit ?? 0) * 1.2, (reference?.maximum ?? 0) * 1.6, (amount ?? 0) * 1.1, 1)
        const hasBar = amount !== null && (reference !== null || limit !== null)
        const guidance = limit !== null && upperLimit ? `${formatAmount(upperLimit.ul!)} ${upperLimit.unit} a day · ${limitLabel}` : null
        return <article key={`${total.name}-${total.unit}`} className="dose-row">
          <div className="dose-heading"><h3>{total.name}</h3><span>{formatAmount(total.amount)} {total.unit}</span></div>
          {hasBar && <div className="dose-track" role="img" aria-label={`${total.name}: ${formatAmount(total.amount)} ${total.unit} a day; ${status}${guidance ? `; ${guidance}` : ''}`}>
            {reference && <span className="dose-range" style={{ left: `${position(reference.minimum, max)}%`, width: `${Math.max(0.8, position(reference.maximum, max) - position(reference.minimum, max))}%` }} />}
            {limit !== null && <><svg aria-hidden="true" className="dose-hatch" style={{ left: `${position(limit, max)}%`, width: `${100 - position(limit, max)}%` }}><defs><pattern id={`hatch-${total.name.replace(/[^a-z0-9]/gi, '')}-${total.unit}`} width="6" height="6" patternUnits="userSpaceOnUse"><path d="M-1 1L1-1M0 6L6 0M5 7L7 5" stroke="currentColor" strokeWidth="1.5" /></pattern></defs><rect width="100%" height="100%" fill={`url(#hatch-${total.name.replace(/[^a-z0-9]/gi, '')}-${total.unit})`} /></svg><span className="dose-limit" style={{ left: `${position(limit, max)}%` }} /></>}
            <span className="dose-marker" style={{ left: `${position(amount!, max)}%` }} />
          </div>}
          <div className="dose-detail"><span className="dose-status" data-evidence={status === 'Evidence dose'}>{status}</span>
            {reference && <span>{formatAmount(reference.minimum)}{reference.minimum !== reference.maximum ? `–${formatAmount(reference.maximum)}` : ''} {reference.unit} {reference.timing}{reference.context ? `. ${reference.context}` : ''}</span>}
            {guidance && <span>{guidance}</span>}
          </div>
          {upperLimit && <p className="dose-context">{upperLimit.note}</p>}
          {(total.contributions?.length ?? 0) > 1 && <p className="dose-breakdown">{total.contributions!.map(part => `${part.product} ${formatAmount(part.amount)} ${total.unit}`).join(' + ')}</p>}
        </article>
      })}
    </div>}
    <div className="dose-legend"><span><i className="dose-key-range" />Evidence range</span><span><i className="dose-key-limit" />Guidance / upper level</span><span><svg aria-hidden="true" width="20" height="12"><path d="M0 6L6 0M0 12L12 0M6 12L18 0M12 12L20 4M18 12L20 10" stroke="currentColor" /></svg>Above guidance / upper level</span><span><i className="dose-key-total" />Your daily total</span></div>
    <p className="dose-context">Published ranges are general context, not a personal prescription or a product benefit score. UK EVM and EFSA guidance are labelled separately. Recorded supplements exclude food and drink. For information only.</p>
  </section>
}
