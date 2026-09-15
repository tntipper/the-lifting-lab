import { claimsReviewFor } from '@/lib/claims-review'

export default function ClaimsReviewNotice({ category }: { category?: string }) {
  const review = claimsReviewFor(category)
  if (!review) return null
  return (
    <aside aria-label={review.title} className="my-4 rounded-xl border border-yellow-500/40 bg-yellow-500/5 p-4">
      <p className="text-sm font-bold text-yellow-400">{review.title}</p>
      <p className="mt-2 text-sm leading-relaxed text-white/80">{review.text}</p>
      <ul className="mt-3 space-y-1 text-xs text-lab-muted">
        {review.sources.map((source) => (
          <li key={source.url}><a href={source.url} className="underline hover:text-white">{source.title}</a></li>
        ))}
      </ul>
    </aside>
  )
}
