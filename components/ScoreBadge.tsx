export function scoreColor(score: number): string {
  if (score >= 70) return '#a6e22e'
  if (score >= 50) return '#f5b342'
  return '#ff5c5c'
}

const SIZES = {
  sm: { px: 48, r: 18, stroke: 4, text: '10px' },
  md: { px: 64, r: 24, stroke: 5, text: '13px' },
  lg: { px: 110, r: 42, stroke: 7, text: '22px' },
}

export default function ScoreBadge({
  score,
  size = 'md',
}: {
  score: number | null
  size?: 'sm' | 'md' | 'lg'
}) {
  const { px, r, stroke, text } = SIZES[size]
  const cx = px / 2
  const circ = 2 * Math.PI * r

  if (score == null) {
    return (
      <div
        className="shrink-0 flex items-center justify-center rounded-full border-2 border-lab-border"
        style={{ width: px, height: px, fontSize: text, color: '#4b5563' }}
      >
        –
      </div>
    )
  }

  const color = scoreColor(score)
  const filled = circ * (score / 100)

  return (
    <div className="shrink-0" style={{ width: px, height: px }}>
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`}>
        {/* track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="#1f2937"
          strokeWidth={stroke}
        />
        {/* fill */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ / 4}
          style={{ filter: `drop-shadow(0 0 4px ${color}66)` }}
        />
        <text
          x={cx}
          y={cx}
          dominantBaseline="central"
          textAnchor="middle"
          fill={color}
          fontWeight="900"
          fontSize={text}
          fontFamily="system-ui, sans-serif"
        >
          {score}
        </text>
      </svg>
    </div>
  )
}
