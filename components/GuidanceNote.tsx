'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { Nutrient } from '@/lib/products'
import { aboveGuidance } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

export default function GuidanceNote({ nutrients }: { nutrients: Nutrient[] }) {
  const notes = aboveGuidance(nutrients)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLSpanElement>(null)
  const [mode, setMode] = useState<'closed' | 'hover' | 'pinned'>('closed')
  const open = mode !== 'closed'
  useEffect(() => {
    if (!open || notes.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      setMode('closed')
      if (container.current?.contains(document.activeElement)) trigger.current?.focus()
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setMode('closed')
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, notes.length])
  if (!notes.length) return null
  return <span ref={container} className={styles.guidance} onPointerEnter={event => { if (event.pointerType === 'mouse') setMode(value => value === 'closed' ? 'hover' : value) }} onPointerLeave={event => { if (event.pointerType === 'mouse' && mode === 'hover' && !event.currentTarget.contains(document.activeElement)) setMode('closed') }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMode('closed') }}>
    <button ref={trigger} type="button" aria-label="Above EFSA single-dose guidance" aria-expanded={open} aria-controls={id}
      onClick={() => setMode(value => value === 'pinned' ? 'closed' : 'pinned')} className={styles.guidanceTrigger}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3v1" /></svg>
    </button>
    <span id={id} hidden={!open} className={styles.guidancePopup} role="note">
      <b>Above EFSA single-dose guidance</b>
      {notes.map(note => <span key={note.source}>{note.text} <a href={note.source} target="_blank" rel="noopener noreferrer">Source ↗</a></span>)}
    </span>
  </span>
}
