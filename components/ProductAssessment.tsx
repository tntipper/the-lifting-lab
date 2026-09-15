import ScoreBadge from './ScoreBadge'
import { assessmentDisplayFor } from '@/lib/assessment-display'

// Shared status for product cards. Held legacy numbers remain inspectable,
// without a green/red effectiveness ring or a fabricated zero assessment.
export default function ProductAssessment({ product, size = 'md' }: {
  product: { category?: string | null; score?: number | null }
  size?: 'sm' | 'md' | 'lg'
}) {
  const assessment = assessmentDisplayFor(product)
  if (assessment.state === 'legacy') return <div className="flex flex-col items-center gap-1" title={assessment.explanation}>
    <ScoreBadge score={assessment.score} size={size} />
    <span className="text-[9px] text-lab-muted">Legacy score</span>
  </div>
  return <div className="max-w-24 text-center text-lab-muted" data-assessment={assessment.state}>
    {assessment.score !== null && <span className="block text-sm font-bold">{assessment.score}/100</span>}
    <span className="block text-[10px] font-bold leading-tight">{assessment.label}</span>
  </div>
}
