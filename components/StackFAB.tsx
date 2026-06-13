'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocalStack } from '@/components/LocalStackContext'

const AR = '166,226,46'

export default function StackFAB() {
  const { stack, remove, clear } = useLocalStack()
  const [open, setOpen] = useState(false)

  // keep the panel accessible even when stack empties (so user sees "empty" state briefly)
  const count = stack.length

  return (
    <>
      {/* backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* slide-up panel */}
      <div
        className="fixed bottom-0 inset-x-0 z-50 transition-transform duration-300"
        style={{ transform: open ? 'translateY(0)' : 'translateY(110%)' }}
      >
        <div
          className="mx-auto max-w-lg rounded-t-2xl"
          style={{
            background: 'linear-gradient(160deg,#161616 0%,#0f0f0f 100%)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderBottom: 'none',
            boxShadow: '0 -8px 40px rgba(0,0,0,0.6)',
          }}
        >
          {/* handle */}
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-10 h-1 rounded-full bg-white/20" />
          </div>

          {/* header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/06">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧪</span>
              <span
                className="text-[13px] font-black uppercase tracking-wide"
                style={{ color: `rgba(${AR},1)` }}
              >
                My Stack
              </span>
              {count > 0 && (
                <span
                  className="text-[10px] font-black px-1.5 py-0.5 rounded-full"
                  style={{ background: `rgba(${AR},0.15)`, color: `rgba(${AR},1)` }}
                >
                  {count}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {count > 0 && (
                <button
                  onClick={clear}
                  className="text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-red-400 transition-colors"
                >
                  Clear all
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-white/40 hover:text-white text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
          </div>

          {/* stack items */}
          <div className="overflow-y-auto max-h-64 px-4 py-2 space-y-1">
            {count === 0 && (
              <p className="text-center text-sm text-white/30 py-6">
                No supplements in your stack yet.<br />
                <span className="text-[11px]">Tap + Stack on any product card.</span>
              </p>
            )}
            {stack.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 rounded-xl px-3 py-2.5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
              >
                {/* score ring dot */}
                <span
                  className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-black"
                  style={{
                    background: item.score != null && item.score >= 70
                      ? 'rgba(166,226,46,0.15)'
                      : item.score != null && item.score >= 50
                      ? 'rgba(232,160,32,0.15)'
                      : 'rgba(224,90,43,0.15)',
                    color: item.score != null && item.score >= 70
                      ? '#a6e22e'
                      : item.score != null && item.score >= 50
                      ? '#E8A020'
                      : '#E05A2B',
                  }}
                >
                  {item.score ?? '—'}
                </span>

                {/* name */}
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-bold text-white truncate">{item.name}</p>
                  <p className="text-[10px] text-white/40 uppercase tracking-widest">{item.brand}</p>
                </div>

                {/* remove */}
                <button
                  onClick={() => remove(item.id)}
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white/30 hover:text-white hover:bg-white/10 transition-colors text-base leading-none"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          {/* footer actions */}
          {count > 0 && (
            <div className="px-4 pb-6 pt-3 flex gap-2">
              <Link
                href="/stack"
                onClick={() => setOpen(false)}
                className="flex-1 text-center text-[11px] font-black uppercase tracking-widest py-3 rounded-xl transition-all"
                style={{
                  background: `linear-gradient(145deg, color-mix(in srgb, #a6e22e 80%, #fff), #a6e22e 45%, color-mix(in srgb, #a6e22e 72%, #000))`,
                  color: '#0d0d0d',
                  boxShadow: `0 0 14px rgba(${AR},0.35)`,
                }}
              >
                View Full Stack →
              </Link>
            </div>
          )}
          {count === 0 && <div className="pb-6" />}
        </div>
      </div>

      {/* FAB — always bottom right */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-4 z-40 flex items-center justify-center transition-all active:scale-95"
        style={{
          width: '58px',
          height: '58px',
          borderRadius: '18px',
          background: count > 0
            ? `linear-gradient(145deg, color-mix(in srgb, #a6e22e 80%, #fff), #a6e22e 45%, color-mix(in srgb, #a6e22e 72%, #000))`
            : 'rgba(22,22,22,0.95)',
          color: count > 0 ? '#0d0d0d' : '#a6e22e',
          border: count > 0 ? 'none' : `1px solid rgba(${AR},0.4)`,
          boxShadow: count > 0
            ? `0 0 20px rgba(${AR},0.45), 0 4px 16px rgba(0,0,0,0.5)`
            : `0 4px 16px rgba(0,0,0,0.5)`,
        }}
        aria-label="My Stack"
      >
        {/* count badge */}
        {count > 0 && !open && (
          <span
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
            style={{ background: '#0d0d0d', color: '#a6e22e', border: '1.5px solid #a6e22e' }}
          >
            {count}
          </span>
        )}
        {open
          ? <span className="text-xl leading-none">×</span>
          : <span className="text-xl leading-none">🧪</span>}
      </button>
    </>
  )
}
