'use client'

import { useId, useRef, useState } from 'react'
import type { Nutrient } from '@/lib/products'
import { aboveGuidance } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

export default function GuidanceNote({ nutrients }: { nutrients: Nutrient[] }) {
  const notes = aboveGuidance(nutrients)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!notes.length) return null
  return <span className={styles.guidance} onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true) }} onPointerLeave={event => { if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) setOpen(false) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }}>
    <button ref={trigger} type="button" aria-label="Above EFSA single-dose guidance" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)} className={styles.guidanceTrigger}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" /><path d="M12 9v5m0 3v1" /></svg>
    </button>
    <span id={id} hidden={!open} className={styles.guidancePopup} role="note">
      <b>Above EFSA single-dose guidance</b>
      {notes.map(note => <span key={note.source}>{note.text} <a href={note.source} target="_blank" rel="noopener noreferrer">Source ↗</a></span>)}
    </span>
  </span>
}
