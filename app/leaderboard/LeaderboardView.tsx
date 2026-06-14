'use client'

import { useEffect, useState } from 'react'
import Avatar from '@/components/Avatar'

export type Row = {
  rank: number
  user_id: string
  username: string
  display_name: string | null
  avatar_type: string
  avatar_id: string
  avatar_url: string | null
  season_points: number
}

export type ArchiveSeason = { id: string; name: string; prize: string; winners: Row[] }

const MEDAL = ['#f5c542', '#c8d0d8', '#cd7f32'] // gold / silver / bronze

function Countdown({ endsAt }: { endsAt: string }) {
  const [now, setNow] = useState<number | null>(null)
  useEffect(() => {
    setNow(Date.now())
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  if (now == null) return <span className="tabular-nums text-lab-muted">—</span>
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return <span className="text-lab-amber font-bold">Season ended</span>
  const d = Math.floor(ms / 86400000)
  const h = Math.floor((ms % 86400000) / 3600000)
  const m = Math.floor((ms % 3600000) / 60000)
  const s = Math.floor((ms % 60000) / 1000)
  const cell = (v: number, l: string) => (
    <span className="inline-flex flex-col items-center px-2">
      <span className="text-xl font-black tabular-nums text-white">{String(v).padStart(2, '0')}</span>
      <span className="text-[9px] uppercase tracking-widest text-lab-muted">{l}</span>
    </span>
  )
  return <span className="inline-flex">{cell(d, 'days')}{cell(h, 'hrs')}{cell(m, 'min')}{cell(s, 'sec')}</span>
}

function RankRow({ row, highlight }: { row: Row; highlight?: boolean }) {
  const medal = row.rank <= 3 ? MEDAL[row.rank - 1] : null
  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-xl border"
      style={{
        borderColor: medal ? `${medal}66` : highlight ? 'rgba(166,226,46,0.5)' : '#262626',
        background: medal ? `${medal}0f` : highlight ? 'rgba(166,226,46,0.06)' : 'transparent',
      }}
    >
      <span className="w-7 text-center font-black tabular-nums shrink-0" style={{ color: medal ?? '#9b9b9b' }}>
        {row.rank}
      </span>
      <Avatar type={row.avatar_type} avatarId={row.avatar_id} url={row.avatar_url} username={row.username} size="sm" />
      <span className="flex-1 min-w-0 truncate text-sm font-bold text-white">
        {row.display_name || row.username}
        {highlight && <span className="ml-2 text-[10px] uppercase tracking-widest text-lab-lime">You</span>}
      </span>
      <span className="shrink-0 font-black tabular-nums text-lab-lime">{row.season_points.toLocaleString()}</span>
    </div>
  )
}

export default function LeaderboardView({
  seasonName, endsAt, prize, rows, userId, userRow, archive,
}: {
  seasonName: string
  endsAt: string | null
  prize: string
  rows: Row[]
  userId: string | null
  userRow: Row | null
  archive: ArchiveSeason[]
}) {
  const [expanded, setExpanded] = useState(false)
  const top = expanded ? rows : rows.slice(0, 10)
  const userInView = userRow && top.some((r) => r.user_id === userRow.user_id)

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      <div className="text-center">
        <p className="text-[11px] uppercase tracking-[0.3em] text-lab-muted font-bold">Seasonal Leaderboard</p>
        <h1 className="text-2xl font-black uppercase tracking-wide mt-1">{seasonName}</h1>
        {endsAt && (
          <div className="mt-4 inline-flex items-center gap-2 bg-lab-panel border border-lab-border rounded-2xl px-4 py-3">
            <Countdown endsAt={endsAt} />
          </div>
        )}
      </div>

      {/* Prize teaser */}
      <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 text-center">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-amber mb-1">🏆 Prizes — Top 3</p>
        <p className="text-sm text-white/80">
          {prize && prize.toLowerCase() !== 'to be announced'
            ? prize
            : 'Prizes for the top 3 — to be announced. Keep earning points to stay in the race.'}
        </p>
      </div>

      {/* Standings */}
      <div className="bg-lab-panel border border-lab-border rounded-2xl p-4 space-y-2">
        {rows.length === 0 ? (
          <p className="text-lab-muted text-sm text-center py-6">
            No points scored yet this season — be the first on the board.
          </p>
        ) : (
          <>
            {top.map((r) => (
              <RankRow key={r.user_id} row={r} highlight={r.user_id === userId} />
            ))}
            {rows.length > 10 && (
              <button
                onClick={() => setExpanded((v) => !v)}
                className="w-full text-[11px] font-bold uppercase tracking-widest text-lab-muted hover:text-white py-2 transition-colors"
              >
                {expanded ? 'Show top 10' : `View full leaderboard (${rows.length})`}
              </button>
            )}
            {/* Pinned own row if outside the shown range */}
            {userRow && !userInView && (
              <>
                <div className="text-center text-lab-muted text-xs py-1">···</div>
                <RankRow row={userRow} highlight />
              </>
            )}
          </>
        )}
      </div>

      {/* Past season archive */}
      {archive.length > 0 && (
        <div className="space-y-4">
          <p className="text-[11px] uppercase tracking-[0.3em] text-lab-muted font-bold text-center">Past Seasons</p>
          {archive.map((s) => (
            <div key={s.id} className="bg-lab-panel/60 border border-lab-border rounded-2xl p-4">
              <p className="text-sm font-black uppercase tracking-wide mb-3">{s.name} — Final Standings</p>
              {s.winners.length === 0 ? (
                <p className="text-lab-muted text-xs">Winners to be announced.</p>
              ) : (
                <div className="space-y-2">
                  {s.winners.map((w) => <RankRow key={w.user_id} row={w} />)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
