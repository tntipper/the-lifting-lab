'use client'

import Link from 'next/link'
import { useLocalStack } from '@/components/LocalStackContext'

export default function StackPill() {
  const { stack } = useLocalStack()
  if (stack.length === 0) return null

  return (
    <Link
      href="/stack"
      className="fixed bottom-5 right-4 z-40 flex items-center gap-2 bg-lab-lime text-black rounded-2xl pl-4 pr-5 py-3 shadow-[0_0_20px_rgba(166,226,46,0.45)] active:scale-[0.98] transition-transform"
    >
      <span className="text-xl">🧪</span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-black uppercase tracking-wide">
          {stack.length} in your stack
        </span>
        <span className="block text-[10px] font-bold opacity-70">Tap to view &amp; analyse</span>
      </span>
    </Link>
  )
}
