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

  const bloomAlpha = score >= 70 ? '0.4' : score >= 50 ? '0.3' : '0.25'
  const bloomColor = score >= 70
    ? `rgba(166,226,46,${bloomAlpha})`
    : score >= 50
    ? `rgba(232,160,32,${bloomAlpha})`
    : `rgba(224,90,43,${bloomAlpha})`

  return (
    <div className="shrink-0 relative" style={{ width: px, height: px }}>
      {/* bloom layer */}
      <span
        className="pointer-events-none absolute rounded-full"
        style={{
          inset: '-6px',
          background: `radial-gradient(ellipse at center, ${bloomColor} 0%, transparent 68%)`,
          filter: 'blur(6px)',
        }}
      />
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="relative z-10">
        {/* track */}
        <circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
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
          style={{ filter: `drop-shadow(0 0 4px ${color}88)` }}
        />
        <text
          x={cx}
          y={cx}
          dominantBaseline="central"
          textAnchor="middle"
          fill={color}
          fontWeight="900"
          fontSize={text}
          fontFamily="var(--font-anton), Impact, 'Arial Narrow Bold', sans-serif"
          style={{ WebkitTextStroke: '0.6px rgba(0,0,0,0.55)' } as React.CSSProperties}
        >
          {score}
        </text>
      </svg>
    </div>
  )
}
