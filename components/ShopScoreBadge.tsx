'use client'

import { useId, useRef, useState } from 'react'
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
  const triggerId = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  const checked = assessment.complianceDate
    ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${assessment.complianceDate}T00:00:00Z`))
    : null
  const label = 'TLL Label Score'
  if (assessment.suppressed) return null
  return <span className={styles.scoreHelp}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape' && open) { setOpen(false); event.stopPropagation(); trigger.current?.focus() } }}>
    <button ref={trigger} id={triggerId} type="button" className={styles.scoreTrigger} aria-expanded={open} aria-controls={tooltipId}
      aria-label={`${label}: ${score == null ? 'Under review' : `${score} out of 100`} Dose & label check`}
      onClick={() => setOpen(value => !value)}>
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
      <span aria-hidden={score != null ? true : undefined} className={styles.scoreLabel}>{label}</span>
      <span className={styles.scoreLabel}>Dose &amp; label check</span>
    </button>
    <span id={tooltipId} role="region" aria-labelledby={triggerId} hidden={!open} className={styles.scoreTooltip}>
      TLL Label Score rates what&apos;s on the label, not the results you&apos;ll get. It compares stated doses with amounts used in published research and checks how transparent the label is. It isn&apos;t a health claim or medical advice. Source: {assessment.sourceUrl ? <a href={assessment.sourceUrl}>brand label</a> : 'brand label'}{checked ? `, checked ${checked}.` : '; compliance check pending.'} Rubric v1. <a href="/methodology">How we score</a>
    </span>
  </span>
}
