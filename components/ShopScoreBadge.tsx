import { assessmentDisplayFor } from '@/lib/assessment-display'
import styles from '@/components/shop.module.css'

// Claude's 70/50 colour bands with the historical TLL SVG ring geometry.
// Displaying a legacy value does not grant assessment approval.
export default function ShopScoreBadge({ product }: {
  product: { category?: string | null; score?: number | null }
}) {
  const assessment = assessmentDisplayFor(product)
  const score = assessment.score
  const band = score == null ? 'unassessed' : score >= 70 ? 'high' : score >= 50 ? 'mid' : 'low'
  const circumference = 2 * Math.PI * 24
  return <span className={`${styles.score} ${score == null ? 'text-lab-muted' : styles.scoreRing}`} data-band={band} data-assessment={assessment.state} title={assessment.explanation}
    aria-label={score == null ? assessment.label : `TLL legacy score: ${score} out of 100`}>
    {score == null ? assessment.label : <>
      <svg aria-hidden="true" width="64" height="64" viewBox="0 0 64 64">
        <circle cx="32" cy="32" r="24" fill="none" stroke="var(--line)" strokeWidth="5" />
        <circle cx="32" cy="32" r="24" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${circumference * score / 100} ${circumference * (1 - score / 100)}`} transform="rotate(-90 32 32)" />
      </svg>
      <span aria-hidden="true" className={styles.scoreNumber}>{score}<small>/ 100</small></span>
    </>}
  </span>
}
