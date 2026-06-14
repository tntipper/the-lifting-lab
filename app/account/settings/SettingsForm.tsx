'use client'

import { useState } from 'react'
import AvatarPicker from '@/components/AvatarPicker'

export default function SettingsForm({
  email, username, displayName,
}: { email: string; username: string; displayName: string }) {
  const [u, setU] = useState(username)
  const [d, setD] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [err, setErr] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setMsg(''); setErr('')
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, display_name: d }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(j.error || 'Could not save'); return }
      setMsg('Saved')
    } finally { setSaving(false) }
  }

  async function del() {
    setDeleting(true)
    try {
      const res = await fetch('/api/profile', { method: 'DELETE' })
      if (res.ok) { window.location.href = '/' }
      else { setErr('Could not delete account'); setDeleting(false) }
    } catch { setErr('Network error'); setDeleting(false) }
  }

  return (
    <div className="space-y-8">
      {/* Profile */}
      <section className="bg-lab-panel border border-lab-border rounded-2xl p-5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-4">Profile</p>
        <form onSubmit={save} className="space-y-4">
          <div>
            <label className="text-lab-muted text-xs uppercase tracking-widest font-bold mb-1.5 block">Username</label>
            <input value={u} onChange={(e) => setU(e.target.value)} placeholder="username"
              className="w-full bg-lab-bg text-white border border-lab-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-lab-lime transition-colors" />
            <p className="text-[10px] text-lab-muted mt-1">3–20 chars · a–z, 0–9, underscore</p>
          </div>
          <div>
            <label className="text-lab-muted text-xs uppercase tracking-widest font-bold mb-1.5 block">Display name (optional)</label>
            <input value={d} onChange={(e) => setD(e.target.value)} placeholder="Your name"
              className="w-full bg-lab-bg text-white border border-lab-border rounded-xl px-4 py-2.5 focus:outline-none focus:border-lab-lime transition-colors" />
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={saving}
              className="text-[11px] font-black uppercase tracking-widest bg-lab-lime text-black rounded-lg px-4 py-2 hover:brightness-110 disabled:opacity-50 transition-all">
              {saving ? 'Saving…' : 'Save changes'}
            </button>
            {msg && <span className="text-lab-lime text-xs">{msg}</span>}
            {err && <span className="text-lab-red text-xs">{err}</span>}
          </div>
        </form>
      </section>

      {/* Avatar */}
      <section className="bg-lab-panel border border-lab-border rounded-2xl p-5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-4">Avatar</p>
        <AvatarPicker />
      </section>

      {/* Sign-in / security */}
      <section className="bg-lab-panel border border-lab-border rounded-2xl p-5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-2">Sign-in & security</p>
        <p className="text-sm text-white/80">Signed in as <span className="text-white font-medium">{email}</span>.</p>
        <p className="text-xs text-lab-muted mt-2">
          The Lifting Lab uses passwordless magic-link sign-in — there’s no password to manage.
          To sign in on a new device, request a fresh link from the sign-in page.
        </p>
      </section>

      {/* Danger zone */}
      <section className="border border-lab-red/40 rounded-2xl p-5">
        <p className="text-[11px] uppercase tracking-widest font-bold text-lab-red mb-2">Delete account</p>
        <p className="text-sm text-white/70 mb-3">
          Permanently delete your account and all associated data (points, reviews, favourites, stacks). This can’t be undone.
        </p>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)}
            className="text-[11px] font-black uppercase tracking-widest border border-lab-red/50 text-lab-red rounded-lg px-4 py-2 hover:bg-lab-red/10 transition-colors">
            Delete my account
          </button>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={del} disabled={deleting}
              className="text-[11px] font-black uppercase tracking-widest bg-lab-red text-white rounded-lg px-4 py-2 disabled:opacity-50">
              {deleting ? 'Deleting…' : 'Yes, delete permanently'}
            </button>
            <button onClick={() => setConfirmDelete(false)} className="text-[11px] font-bold uppercase tracking-widest text-lab-muted hover:text-white">
              Cancel
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
