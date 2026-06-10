// Clinical score badge. Neon lime >=70, amber 50-69, red <50.
export function scoreColor(score: number): string {
  if (score >= 70) return '#a6e22e'
  if (score >= 50) return '#f5b342'
  return '#ff5c5c'
}

export default function ScoreBadge({
  score,
  size = 'md',
  label,
}: {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
  label?: string
}) {
  if (score == null) {
    return (
      <span className="text-xs text-gray-600 font-medium">no score</span>
    )
  }
  const color = scoreColor(score)
  const dim = size === 'lg' ? 'h-14 w-14 text-xl' : size === 'sm' ? 'h-8 w-8 text-[11px]' : 'h-11 w-11 text-sm'
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        className={`${dim} rounded-full flex items-center justify-center font-black border-2`}
        style={{ color, borderColor: color, boxShadow: `0 0 10px ${color}33` }}
      >
        {score}
      </div>
      {label && (
        <span className="text-[9px] uppercase tracking-widest font-bold text-lab-muted">{label}</span>
      )}
    </div>
  )
}
