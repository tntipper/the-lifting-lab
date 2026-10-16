import reviewedAssessments from '../data/reviewed-assessments.json'
import { claimsReviewFor } from './claims-review'

type AssessmentInput = { id: string; category?: string | null; score?: number | null }
type ReviewedAssessment = {
  key: string
  score: number
  science_reviewer: 'Assay'
  science_date: string
  compliance_reviewer: 'Oath'
  compliance_date: string
  source_url?: string
  notes: string
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function validRecord(value: unknown): value is ReviewedAssessment {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return typeof row.key === 'string' && row.key.trim().length > 0
    && typeof row.score === 'number' && Number.isFinite(row.score) && row.score >= 1 && row.score <= 100
    && row.science_reviewer === 'Assay' && validDate(row.science_date)
    && row.compliance_reviewer === 'Oath' && validDate(row.compliance_date)
    && typeof row.notes === 'string'
}

// Validate once at module load; malformed rows cannot grant approval.
const records: unknown = reviewedAssessments
const approved = new Map<string, ReviewedAssessment>(
  (Array.isArray(records) ? records : []).filter(validRecord).map(row => [row.key, row]),
)

function approvedAssessment(product: AssessmentInput) {
  return claimsReviewFor(product.category) ? undefined : approved.get(product.id)
}

export function assessmentDisplayFor(product: AssessmentInput) {
  const review = claimsReviewFor(product.category)
  const record = approvedAssessment(product)
  if (!record) return {
    state: 'under_review' as const, score: null, label: 'Under review', complianceDate: null, sourceUrl: null,
    suppressed: product.id === 'a0fc6933-db03-4c34-a446-a9f89515a206',
    explanation: review
      ? `${review.title}. Existing score is not a validated health-benefit assessment.`
      : 'Under review — no assessment signed off by both Assay and Oath is available.',
  }
  return {
    state: 'approved' as const, score: record.score, label: `${record.score}/100`,
    complianceDate: record.compliance_date,
    sourceUrl: typeof record.source_url === 'string' && /^https?:\/\//i.test(record.source_url) ? record.source_url : null,
    suppressed: false,
    explanation: `Assessment reviewed by Assay (${record.science_date}) and Oath (${record.compliance_date}).`,
  }
}

export function hasApprovedAssessment(product: AssessmentInput) {
  return approvedAssessment(product) !== undefined
}

export function hasPositiveServingCost<T extends { cost_per_serving: number | null }>(product: T): product is T & { cost_per_serving: number } {
  return typeof product.cost_per_serving === 'number' && Number.isFinite(product.cost_per_serving) && product.cost_per_serving > 0
}

// Alphabetical order and raw price order carry no assessment endorsement.
export function isRankingCandidate(product: AssessmentInput & { cost_per_serving: number | null }, sort: string) {
  return hasApprovedAssessment(product) && (sort === 'score' || ((sort === 'value' || sort === 'budget') && hasPositiveServingCost(product)))
}

// Use before serializing catalogue records: legacy values must never reach clients.
export function displaySafeProduct<T extends AssessmentInput>(product: T): T & { score: number | null } {
  return { ...product, score: assessmentDisplayFor(product).score }
}
