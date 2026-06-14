'use client'

import { useState } from 'react'

// Small copy-to-clipboard button used for referral links.
export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable
    }
  }
  return (
    <button
      onClick={copy}
      className="text-[11px] font-black uppercase tracking-widest rounded-lg px-3 py-2 border border-lab-lime/50 text-lab-lime hover:bg-lab-lime/10 transition-colors whitespace-nowrap"
    >
      {copied ? '✓ Copied' : label}
    </button>
  )
}
