import { assessmentDisplayFor } from '@/lib/assessment-display'

// Shared status for product cards. Held legacy numbers remain inspectable,
// without a green/red effectiveness ring or a fabricated zero assessment.
export default function ProductAssessment({ product, size = 'md' }: {
  product: { category?: string | null; score?: number | null }
  size?: 'sm' | 'md' | 'lg'
}) {
  const assessment = assessmentDisplayFor(product)
  return <div className="max-w-24 text-center text-lab-muted" data-assessment={assessment.state} title={assessment.explanation}>
    {assessment.score !== null && <span className={`block font-bold ${size === 'lg' ? 'text-xl' : 'text-sm'}`}>{assessment.score}/100</span>}
    <span className="block text-[10px] font-bold leading-tight">{assessment.label}</span>
    {assessment.state === 'legacy' && <span className="block text-[9px]">Unverified</span>}
  </div>
}
