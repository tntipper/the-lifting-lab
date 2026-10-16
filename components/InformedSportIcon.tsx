'use client'

import { useEffect, useId, useRef, useState } from 'react'
import styles from '@/components/shop.module.css'

export default function InformedSportIcon({ certified, sourceUrl }: { certified: boolean | null; sourceUrl?: string | null }) {
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const container = useRef<HTMLSpanElement>(null)
  const [mode, setMode] = useState<'closed' | 'hover' | 'pinned'>('closed')
  const open = mode !== 'closed'
  useEffect(() => {
    if (!open || !certified) return
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
  }, [open, certified])
  if (!certified) return null
  const source = sourceUrl && /^https?:\/\//i.test(sourceUrl) ? sourceUrl : null
  return <span ref={container} className={styles.certification}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setMode(value => value === 'closed' ? 'hover' : value) }}
    onPointerLeave={event => { if (event.pointerType === 'mouse' && mode === 'hover' && !event.currentTarget.contains(document.activeElement)) setMode('closed') }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setMode('closed') }}>
    <button ref={trigger} type="button" className={styles.certificationTrigger}
      aria-label="Informed Sport certified" aria-expanded={open} aria-controls={id}
      onClick={() => setMode(value => value === 'pinned' ? 'closed' : 'pinned')}>
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
