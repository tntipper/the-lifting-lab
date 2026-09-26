import { assessmentDisplayFor } from '@/lib/assessment-display'

// Shared public status for product cards. Frozen numbers are not approved
// assessments, so they stay out of the customer-facing card.
export default function ProductAssessment({ product, size = 'md' }: {
  product: { category?: string | null; score?: number | null }
  size?: 'sm' | 'md' | 'lg'
}) {
  const assessment = assessmentDisplayFor(product)
  return <div className="max-w-24 text-center text-lab-muted" data-assessment={assessment.state} title={assessment.explanation}>
    <span className={`block font-bold leading-tight ${size === 'lg' ? 'text-sm' : 'text-[10px]'}`}>
      {assessment.label}
    </span>
  </div>
}
