'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/** Native modal semantics keep closed content out of focus and the page inert. */
export default function AccessibleDialog({
  open, onClose, labelledBy, children, className = '',
}: {
  open: boolean
  onClose: () => void
  labelledBy: string
  children: ReactNode
  className?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!open || !dialog) return
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.showModal()
    dialog.scrollTop = 0
    dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus({ preventScroll: true })
    return () => {
      dialog.close()
      document.body.style.overflow = previousOverflow
      if (trigger?.isConnected) trigger.focus({ preventScroll: true })
    }
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={`tll-dialog ${className}`}
      onCancel={(event) => { event.preventDefault(); onClose() }}
      onClose={() => { if (open && !ref.current?.open) onClose() }}
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return
        const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex], [contenteditable="true"]')]
          .filter(element => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0 && getComputedStyle(element).visibility === 'visible')
        const first = controls[0], last = controls[controls.length - 1]
        if (!first || !last) { event.preventDefault(); return }
        // Status/heading targets can receive programmatic focus without being tab stops.
        // Native traversal from a final status paragraph can otherwise enter browser chrome.
        if (!controls.includes(document.activeElement as HTMLElement)) {
          event.preventDefault(); (event.shiftKey ? last : first).focus()
        }
        else if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const box = event.currentTarget.getBoundingClientRect()
        if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose()
      }}
    >
      {open ? children : null}
    </dialog>
  )
}
