import { assessmentDisplayFor } from './assessment-display'
import { scoreFor } from '@/lib/scores'

type CatalogueIdentity = { id: string; brand: string; name: string; category: string }

// Call only with identities loaded from the catalogue. An incidental stored or
// caller-supplied `score` property never participates in this projection.
export function catalogueAssessment(product: CatalogueIdentity) {
  return { ...product, score: scoreFor(product.brand, product.name) }
}

export function summariseStackAssessments(products: CatalogueIdentity[], listedCount?: number) {
  const unique = [...new Map(products.map(product => [product.id, product])).values()]
  const states = unique.map(product => assessmentDisplayFor(catalogueAssessment(product)))
  const total = Math.max(unique.length, listedCount ?? unique.length)
  const underReview = states.filter(state => state.state === 'under_review').length
  const unassessed = total - underReview
  const average = null
  const text = `No approved product effectiveness assessment is available. 0 of ${total} products included.`
  return {
    average, included: 0, total, underReview, unassessed,
    text: `${text} ${underReview} under review and ${unassessed} unassessed or unavailable excluded. This is not a combined-stack assessment. Scientific review is incomplete; no effectiveness recommendation is made.`,
  }
}

export function assessmentText(product: { category: string; score: number | null }) {
  const assessment = assessmentDisplayFor(product)
  return assessment.state === 'under_review'
    ? 'Under review; no benefit recommendation'
    : 'Not assessed; no benefit recommendation'
}

export function stackResearchText(products: CatalogueIdentity[], listedCount?: number) {
  const summary = summariseStackAssessments(products, listedCount)
  return `My supplement research stack on The Lifting Lab. ${summary.text}\n` + products.map(product =>
    `${product.brand} ${product.name}: ${assessmentText(catalogueAssessment(product))}.`,
  ).join('\n')
}
