'use client'
import { useId, useState } from 'react'
import AccessibleDialog from '@/components/AccessibleDialog'
import ClaimsReviewNotice from '@/components/ClaimsReviewNotice'
import { claimsReviewFor } from '@/lib/claims-review'
import { methodologyFor } from '@/lib/methodology'
export default function MethodologyModal({ category }: { category?: string }) {
  const [open, setOpen] = useState(false), titleId = useId()
  const method = methodologyFor(category), review = claimsReviewFor(category)
  return <>
    <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className="text-xs font-bold text-lab-lime hover:underline uppercase tracking-widest shrink-0">ⓘ How we score</button>
    <AccessibleDialog open={open} onClose={() => setOpen(false)} labelledBy={titleId} className="tll-centered-dialog bg-lab-bg border border-lab-border rounded-2xl p-5">
      <div className="flex justify-between items-start mb-4"><h2 id={titleId} className="text-lg font-black uppercase italic">How We Score</h2><button type="button" aria-label="Close scoring explanation" data-dialog-initial-focus onClick={() => setOpen(false)} className="text-lab-muted text-xl min-w-11 min-h-11">✕</button></div>
      <div className="space-y-4 text-sm text-white/80 leading-relaxed"><ClaimsReviewNotice category={category} />
        <p>No approved effectiveness assessment is available. Existing percentages are unverified historical formula values and do not establish an effective dose, product quality or a recommendation.</p>
        <p>Effectiveness rankings, best-product awards and score-per-pound selections are unavailable. Price-only views compare recorded prices with known serving data; they do not certify a retailer offer or equivalent benefit.</p>
        {method && <section className="rounded-xl border border-lab-border bg-lab-panel p-3"><h3 className="font-bold text-lab-muted mb-2">{review ? 'Legacy weights under review' : 'Historical formula inputs — unverified'}</h3><p className="text-xs mb-3">These stored targets and weights describe the old formula. They are not approved reference doses or dosing recommendations. The original formula source is retained for review.</p><div className="space-y-2">{method.rows.map(row => <div key={row.ingredient} className="flex flex-wrap gap-2 border border-lab-border rounded-lg p-2 text-xs"><span className="flex-1 min-w-0">{row.ingredient}</span><span className="text-lab-muted">{row.target}</span><span className="text-lab-muted">{row.weight}</span></div>)}</div></section>}
      </div>
    </AccessibleDialog>
  </>
}
