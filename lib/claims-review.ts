// Interim editorial containment; this is not a scientific validation of scores.
export const CLAIM_SOURCES = {
  steroids: { title: 'NHS: anabolic steroid misuse', url: 'https://www.nhs.uk/conditions/anabolic-steroid-misuse/' },
  milkThistle: { title: 'NCCIH: milk thistle evidence and safety', url: 'https://www.nccih.nih.gov/health/milk-thistle' },
  ashwagandha: { title: 'NCCIH: ashwagandha evidence and safety', url: 'https://www.nccih.nih.gov/health/ashwagandha' },
  testosterone: { title: 'Endocrine Society: diagnosing testosterone deficiency', url: 'https://www.endocrine.org/clinical-practice-guidelines/testosterone-therapy' },
} as const

const organReview = {
  title: 'Organ-protection claims under review',
  text: 'These category scores and ingredient flags have not been validated as measures of liver or cardiovascular protection. Do not use a score, supplement or monitoring plan as reassurance that anabolic steroid use is safe. The NHS lists serious heart, liver and other risks from misuse.',
  sources: [CLAIM_SOURCES.steroids, CLAIM_SOURCES.milkThistle],
}
const hormoneReview = {
  title: 'Hormone claims under review',
  text: 'These category scores and ingredient flags have not been validated as predictions of testosterone, sleep or recovery benefits. An ingredient name or dose threshold does not establish a benefit for you. Suspected testosterone deficiency needs clinical assessment; supplements do not replace it.',
  sources: [CLAIM_SOURCES.testosterone, CLAIM_SOURCES.ashwagandha],
}

export function claimsReviewFor(category: string | null | undefined) {
  if (category === 'cycle-support' || category === 'liver-health') return organReview
  if (category === 'hormone-support') return hormoneReview
  if (category === 'zma') return { ...hormoneReview, sources: [CLAIM_SOURCES.testosterone] }
  return null
}

export const TESTOSTERONE_REVIEW = {
  title: 'Testosterone Supplements — Evidence Review in Progress',
  description: 'Testosterone supplement claims are under review. Read the current evidence limitations, safety information and when to seek clinical assessment.',
  faqs: [
    { q: 'Does this page recommend a testosterone booster?', a: 'No. TLL has paused its ingredient verdicts and purchase recommendations on this page while the supporting claims are reviewed. This update does not validate the existing hormone-category scores.' },
    { q: 'What does the evidence say about ashwagandha?', a: 'NCCIH describes limited evidence of a possible testosterone effect, with small studies and varying preparations. That does not establish a benefit for every extract, product or person. Long-term safety is uncertain, and rare liver injury and medicine interactions are reported.' },
    { q: 'How is low testosterone assessed?', a: 'The Endocrine Society recommends diagnosing testosterone deficiency in men only when compatible symptoms and signs occur with consistently low levels, confirmed with repeat morning fasting testing. A clinician should assess the cause. Do not self-diagnose or self-treat with a supplement.' },
  ],
}
