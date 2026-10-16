'use client'

import { useId, useState } from 'react'
import { assessmentDisplayFor } from '@/lib/assessment-display'
import styles from '@/components/shop.module.css'

export default function ShopScoreBadge({ product }: {
  product: { id: string; category?: string | null; score?: number | null }
}) {
  const assessment = assessmentDisplayFor(product)
  const score = assessment.score
  const band = score == null ? 'unassessed' : score >= 70 ? 'high' : score >= 50 ? 'mid' : 'low'
  const circumference = 2 * Math.PI * 24
  const tooltipId = useId()
  const [open, setOpen] = useState(false)
  const checked = assessment.complianceDate
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${assessment.complianceDate}T00:00:00Z`))
    : null
  const label = assessment.valueLed ? 'Value-led score' : 'TLL score'
  return <span className={styles.scoreHelp} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}
    onFocus={event => { if (event.target.matches(':focus-visible')) setOpen(true) }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape') { setOpen(false); event.stopPropagation() } }}>
    <button type="button" className={styles.scoreTrigger} aria-expanded={open} aria-controls={tooltipId}
      aria-describedby={open ? tooltipId : undefined} onClick={() => setOpen(value => !value)}>
      <span role="img" className={`${styles.score} ${styles.scoreRing} ${score == null ? 'text-lab-muted' : ''}`} data-band={band} data-assessment={assessment.state}
        aria-label={score == null ? 'Under review' : `${label}: ${score} out of 100`}>
        <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="24" fill="none" stroke="var(--line)" strokeWidth="5" />
          {score != null && <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
            strokeDasharray={`${circumference * score / 100} ${circumference * (1 - score / 100)}`} transform="rotate(-90 32 32)" />}
        </svg>
        {score == null
          ? <span aria-hidden="true" className={styles.scoreStatus}>Under review</span>
          : <span aria-hidden="true" className={styles.scoreNumber}>{score}<small>/ 100</small></span>}
      </span>
      {assessment.valueLed && <span className={styles.valueLed}>Value-led score</span>}
    </button>
    <span id={tooltipId} role="tooltip" hidden={!open} className={styles.scoreTooltip}>
      TLL Score rates the label, not your results. It compares the stated doses against the evidence-based amounts in our method, how transparent the label is, and the price per serving. It isn&apos;t a health claim or medical advice. Source: brand label/retailer listing{checked ? `, checked ${checked}.` : '; compliance check pending.'} <a href="/methodology">How we score</a>
      {assessment.valueLed && <span className={styles.valueLed}>This score is driven mainly by price per serving.</span>}
    </span>
  </span>
}
