'use client'

import Link from 'next/link'

// Placeholder featured slot. When a brand pays for placement,
// replace this with their real data via a Supabase featured_brands table.
export default function FeaturedSlot() {
  return (
    <Link
      href="/contact"
      className="block w-full rounded-2xl border border-dashed border-yellow-500/50 bg-yellow-500/5 p-4 text-center hover:bg-yellow-500/10 transition-colors"
    >
      <div className="text-[10px] font-black uppercase tracking-widest text-yellow-400 mb-1">
        ⭐ Featured Placement
      </div>
      <div className="text-sm font-black uppercase text-white leading-tight">Your Brand Here</div>
      <div className="text-[11px] text-gray-400 mt-1">
        Reading this? So are your customers.
        <br />
        Get in touch to feature your brand.
      </div>
      <div className="mt-3 inline-block bg-yellow-500 text-black text-[11px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full">
        Contact Us ›
      </div>
    </Link>
  )
}
