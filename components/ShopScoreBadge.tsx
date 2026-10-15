import { assessmentDisplayFor } from '@/lib/assessment-display'
import styles from '@/app/products/shop.module.css'

// The design's 70/50 score bands. Only the reviewed display projection may
// supply a number; a frozen legacy score does not grant evidence approval.
export default function ShopScoreBadge({ product }: {
  product: { category?: string | null; score?: number | null }
}) {
  const assessment = assessmentDisplayFor(product)
  const score = assessment.score as number | null
  const band = score == null ? 'unassessed' : score >= 70 ? 'high' : score >= 50 ? 'mid' : 'low'
  const word = band === 'high' ? 'Strong' : band === 'mid' ? 'Moderate' : 'Weak'
  return <span className={`${styles.score} ${score == null ? 'text-lab-muted' : ''}`} data-band={band} data-assessment={assessment.state} title={assessment.explanation}>
    {score == null ? assessment.label : <><span className="font-mono">{score} / 100</span><small>{word}</small></>}
  </span>
}
