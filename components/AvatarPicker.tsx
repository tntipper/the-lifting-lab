'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase'
import Avatar from '@/components/Avatar'

type CatalogItem = {
  id: string
  name: string
  type: 'standard' | 'premium' | 'seasonal'
  season_id: string | null
  points_cost: number
  asset_url: string | null
  active: boolean
  sort_order: number
}
type Data = {
  catalog: CatalogItem[]
  unlocked: string[]
  profile: { avatar_type: string; avatar_id: string; avatar_url: string | null } | null
  balance: number
  currentSeasonId: string | null
}

export default function AvatarPicker({ onUpdate }: { onUpdate?: () => void }) {
  const [data, setData] = useState<Data | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    const d = await fetch('/api/avatars').then((r) => r.json()).catch(() => null)
    if (d) setData(d)
  }
  useEffect(() => { load() }, [])

  if (!data) return <p className="text-lab-muted text-sm">Loading avatars…</p>

  const owned = (id: string) => data.unlocked.includes(id)
  const selected = data.profile?.avatar_id
  const seasonalActive = (it: CatalogItem) =>
    it.type === 'seasonal' && it.active && it.season_id === data.currentSeasonId

  async function select(id: string, avatarUrl?: string) {
    setBusyId(id); setError('')
    try {
      const res = await fetch('/api/avatars', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: id, avatarUrl }),
      })
      if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error || 'Could not select'); return }
      await load(); onUpdate?.()
    } finally { setBusyId(null) }
  }

  async function unlock(id: string) {
    setBusyId(id); setError('')
    try {
      const res = await fetch('/api/avatars', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId: id }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j?.ok === false) {
        setError(j?.error === 'insufficient_points' ? 'Not enough points yet' : (j?.error || 'Unlock failed'))
        return
      }
      await load(); onUpdate?.()
    } finally { setBusyId(null) }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) { setError('Image files only'); return }
    if (file.size > 5 * 1024 * 1024) { setError('Max 5MB'); return }
    setUploading(true); setError('')
    try {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { window.location.href = '/auth'; return }
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
      const path = `${user.id}/avatar-${Date.now()}.${ext}`
      const up = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (up.error) { setError(up.error.message); return }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
      await select('custom-photo', pub.publicUrl)
    } finally { setUploading(false) }
  }

  const groups: { label: string; items: CatalogItem[] }[] = [
    { label: 'Standard — free', items: data.catalog.filter((i) => i.type === 'standard') },
    { label: 'Premium — unlock with points', items: data.catalog.filter((i) => i.type === 'premium' && i.id !== 'custom-photo') },
    { label: 'Seasonal — limited edition', items: data.catalog.filter((i) => i.type === 'seasonal') },
  ]

  function Tile({ it }: { it: CatalogItem }) {
    const isOwned = owned(it.id)
    const isSelected = selected === it.id
    const expired = it.type === 'seasonal' && !seasonalActive(it)
    const canSelect = it.type === 'standard' || isOwned
    const locked = !canSelect
    const greyed = expired && !isOwned

    return (
      <div
        className="relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-colors"
        style={{
          borderColor: isSelected ? '#a6e22e' : '#262626',
          background: isSelected ? 'rgba(166,226,46,0.08)' : 'transparent',
          opacity: greyed ? 0.45 : 1,
        }}
      >
        <Avatar type={it.type} avatarId={it.id} username={it.name} size="md" />
        <span className="text-[11px] text-center text-white/80 leading-tight">{it.name}</span>
        {it.type === 'seasonal' && (
          <span className="text-[9px] uppercase tracking-widest font-bold" style={{ color: expired ? '#777' : '#2e8fe0' }}>
            {isOwned ? 'Owned' : expired ? 'Expired' : 'Exclusive'}
          </span>
        )}

        {isSelected ? (
          <span className="text-[10px] font-black uppercase tracking-widest text-lab-lime">✓ Selected</span>
        ) : canSelect ? (
          <button onClick={() => select(it.id)} disabled={busyId === it.id}
            className="text-[10px] font-bold uppercase tracking-widest text-lab-muted hover:text-white disabled:opacity-50">
            {busyId === it.id ? '…' : 'Select'}
          </button>
        ) : greyed ? (
          <span className="text-[10px] text-lab-muted">Unavailable</span>
        ) : (
          <button onClick={() => unlock(it.id)} disabled={busyId === it.id || data!.balance < it.points_cost}
            className="text-[10px] font-black uppercase tracking-widest rounded-md px-2 py-1 border border-lab-amber/50 text-lab-amber hover:bg-lab-amber/10 disabled:opacity-40">
            {busyId === it.id ? '…' : `Unlock · ${it.points_cost}`}
          </button>
        )}
        {locked && !greyed && <span className="absolute top-2 right-2 text-[10px]">🔒</span>}
      </div>
    )
  }

  const custom = data.catalog.find((i) => i.id === 'custom-photo')
  const customOwned = owned('custom-photo')
  const customSelected = selected === 'custom-photo'

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-lab-muted">Spendable balance</span>
        <span className="text-sm font-black text-lab-lime tabular-nums">{data.balance.toLocaleString()} pts</span>
      </div>
      {error && <p className="text-lab-red text-xs">{error}</p>}

      {groups.map((g) => (
        <div key={g.label}>
          <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">{g.label}</p>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {g.items.map((it) => <Tile key={it.id} it={it} />)}
          </div>
        </div>
      ))}

      {/* Custom photo */}
      {custom && (
        <div>
          <p className="text-[10px] uppercase tracking-widest font-bold text-lab-muted mb-2">Custom Photo</p>
          <div className="flex items-center gap-4 p-4 rounded-xl border border-lab-border"
            style={{ borderColor: customSelected ? '#a6e22e' : '#262626' }}>
            <Avatar
              type={customOwned && data.profile?.avatar_url ? 'custom_photo' : 'standard'}
              avatarId="custom-photo"
              url={data.profile?.avatar_url ?? null}
              size="lg"
            />
            <div className="flex-1">
              <p className="text-sm font-bold text-white">Upload your own photo</p>
              <p className="text-xs text-lab-muted mb-2">Image only, max 5MB.</p>
              {customOwned ? (
                <div className="flex gap-2">
                  <button onClick={() => fileRef.current?.click()} disabled={uploading}
                    className="text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-3 py-1.5 disabled:opacity-50">
                    {uploading ? 'Uploading…' : data.profile?.avatar_url ? 'Replace photo' : 'Upload photo'}
                  </button>
                  {data.profile?.avatar_url && !customSelected && (
                    <button onClick={() => select('custom-photo', data.profile!.avatar_url!)} disabled={busyId === 'custom-photo'}
                      className="text-[11px] font-bold uppercase tracking-widest text-lab-muted hover:text-white">
                      Use as avatar
                    </button>
                  )}
                  <input ref={fileRef} type="file" accept="image/*" onChange={onFile} className="hidden" />
                </div>
              ) : (
                <button onClick={() => unlock('custom-photo')} disabled={busyId === 'custom-photo' || data.balance < custom.points_cost}
                  className="text-[11px] font-black uppercase tracking-widest rounded-lg px-3 py-1.5 border border-lab-amber/50 text-lab-amber hover:bg-lab-amber/10 disabled:opacity-40">
                  Unlock · {custom.points_cost} pts
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
