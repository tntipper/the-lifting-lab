import { claimsReviewFor } from './claims-review'

type AssessmentInput = { category?: string | null; score?: number | null }

// Interim containment of the frozen legacy scores, not an evidence approval.
// There is no versioned assessment/provenance field yet. In particular, zero
// cannot distinguish an intentional failed assessment from missing evidence.
// Keep the source value intact, but withhold its ranking and recommendation.
export function assessmentDisplayFor(product: AssessmentInput) {
  const review = claimsReviewFor(product.category)
  const score = typeof product.score === 'number' && Number.isFinite(product.score)
    && product.score > 0 && product.score <= 100 ? product.score : null
  if (review) return {
    state: 'under_review' as const, score, label: 'Under review',
    explanation: `${review.title}. Existing score is not a validated health-benefit assessment.`,
  }
  if (score === null) return {
    state: 'unassessed' as const, score: null, label: 'Not assessed',
    explanation: 'Not assessed — no usable assessment is available. Label information remains available for research; no dosing or benefit recommendation is made.',
  }
  return { state: 'legacy' as const, score, label: 'Legacy score', explanation: 'Unverified historical formula value. No approved effectiveness or dosing assessment is available; this value must not drive a recommendation.' }
}

export function hasApprovedAssessment<T extends AssessmentInput>(product: T): product is T & { score: number } {
  // There is no approved, versioned assessment dataset yet. Neither a positive
  // legacy value, a category nor a caller-supplied property can grant approval.
  // A future reviewed projection must replace this gate, not add a fallback.
  void product
  return false
}

export function hasPositiveServingCost<T extends { cost_per_serving: number | null }>(product: T): product is T & { cost_per_serving: number } {
  return typeof product.cost_per_serving === 'number' && Number.isFinite(product.cost_per_serving) && product.cost_per_serving > 0
}

// Alphabetical order and raw price order carry no assessment endorsement.
export function isRankingCandidate(product: AssessmentInput & { cost_per_serving: number | null }, sort: string) {
  return hasApprovedAssessment(product) && (sort === 'score' || ((sort === 'value' || sort === 'budget') && hasPositiveServingCost(product)))
}
