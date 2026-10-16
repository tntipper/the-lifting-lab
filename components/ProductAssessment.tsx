import { assessmentDisplayFor } from '@/lib/assessment-display'

// Text-only status for research and comparison surfaces. A legacy value
// does not grant assessment approval. Shop cards use ShopScoreBadge.
export default function ProductAssessment({ product, size = 'md' }: {
  product: { id: string; category?: string | null; score?: number | null }
  size?: 'sm' | 'md' | 'lg'
}) {
  const assessment = assessmentDisplayFor(product)
  if (assessment.suppressed) return null
  return <div className="max-w-24 text-center text-lab-muted" data-assessment={assessment.state} title={assessment.explanation}>
    <span className={`block font-bold leading-tight ${size === 'lg' ? 'text-sm' : 'text-[10px]'}`}>
      {assessment.label}
    </span>
  </div>
}
