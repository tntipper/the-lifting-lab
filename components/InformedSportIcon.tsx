'use client'

import { useId, useRef, useState } from 'react'
import styles from '@/components/shop.module.css'

export default function InformedSportIcon({ certified, sourceUrl }: { certified: boolean | null; sourceUrl?: string | null }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const [open, setOpen] = useState(false)
  if (!certified) return null
  const source = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null
  return <span className={styles.certification}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true) }}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && !event.currentTarget.contains(document.activeElement)) setOpen(false) }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false) }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus() } }}>
    <button ref={trigger} type="button" className={styles.certificationTrigger}
      aria-label="Informed Sport certified" aria-expanded={open} aria-controls={id}
      onClick={() => setOpen(value => !value)}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" /><path d="m8 12 3 3 5-6" />
      </svg>
    </button>
    <span id={id} hidden={!open} className={styles.certificationPopup} role="note">
      <b>Informed Sport certified</b>
      {source && <a href={source} target="_blank" rel="noopener noreferrer">Source ↗</a>}
    </span>
  </span>
}
