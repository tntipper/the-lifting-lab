'use client'

import { useEffect, useState } from 'react'
import { MYPROTEIN_REF_CODE, myproteinLink, bulkDealsLink } from '@/lib/affiliate'
import { track } from '@/lib/gtag'

// The interactive half of /deals: the one verified refer-a-friend code (copy +
// shop), plus the affiliate-partner retailers whose links carry a real tracking
// credential. Kept client-side purely for the copy interaction + GA4 events; all
// the crawlable prose lives in the server page around it.

function CodeCard() {
  const [copied, setCopied] = useState(false)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(MYPROTEIN_REF_CODE)
      setCopied(true)
      track('deal_code_copy', { brand: 'myprotein', code: MYPROTEIN_REF_CODE })
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // clipboard unavailable — the shop link still applies the code automatically
    }
  }

  return (
    <div
      className="rounded-2xl p-6 mb-6"
      style={{
        background: 'rgba(166,226,46,0.06)',
        border: '1px solid rgba(166,226,46,0.5)',
        boxShadow: '0 0 28px rgba(166,226,46,0.10)',
      }}
    >
      <div className="flex items-center justify-between gap-3 mb-1">
        <p className="text-[11px] uppercase tracking-[0.25em] font-black text-lab-lime">
          ✓ Verified code
        </p>
        <span className="text-[10px] uppercase tracking-widest text-lab-muted">MyProtein UK</span>
      </div>
      <h2 className="text-xl font-black uppercase tracking-wide text-white mb-3">
        MyProtein refer-a-friend discount
      </h2>

      {/* the actual code */}
      <div className="flex flex-col sm:flex-row items-stretch gap-2 mb-4">
        <div
          className="flex-1 flex items-center justify-center rounded-xl px-4 py-3 font-mono text-lg font-black tracking-[0.2em] text-white"
          style={{ background: '#0d0d0d', border: '1px dashed rgba(166,226,46,0.6)' }}
        >
          {MYPROTEIN_REF_CODE}
        </div>
        <button
          onClick={copyCode}
          className="text-[11px] font-black uppercase tracking-widest rounded-xl px-5 py-3 border border-lab-lime/60 text-lab-lime hover:bg-lab-lime/10 transition-colors whitespace-nowrap"
        >
          {copied ? '✓ Copied' : 'Copy code'}
        </button>
      </div>

      <a
        href={myproteinLink()}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={() => track('deal_shop_click', { brand: 'myprotein' })}
        className="block text-center text-xs font-black uppercase tracking-widest bg-lab-lime text-black px-5 py-3 rounded-xl hover:opacity-90"
      >
        Shop MyProtein with code applied →
      </a>

      <p className="text-lab-muted/80 text-xs leading-relaxed mt-3">
        This is our own refer-a-friend link. The <span className="text-white/80">Shop</span> button
        adds the code at checkout automatically; or copy it and paste it into the promo box yourself.
        It applies MyProtein&apos;s current new-customer refer-a-friend discount (exact amount is set by
        MyProtein and can change) and, in return, credits us — at no extra cost to you.
      </p>
    </div>
  )
}

function PartnerCard({
  brand,
  blurb,
  href,
  tracked,
}: {
  brand: string
  blurb: string
  href: string
  tracked: string
}) {
  return (
    <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 flex flex-col">
      <p className="text-sm font-black uppercase tracking-wide text-white mb-1">{brand}</p>
      <p className="text-lab-muted text-xs leading-relaxed mb-4 flex-1">{blurb}</p>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        onClick={() => track('deal_shop_click', { brand: tracked })}
        className="text-center text-[11px] font-black uppercase tracking-widest py-2.5 rounded-xl"
        style={{
          background: 'rgba(166,226,46,0.12)',
          color: '#a6e22e',
          border: '1px solid rgba(166,226,46,0.5)',
        }}
      >
        See current deals →
      </a>
    </div>
  )
}

export default function DealsBoard() {
  // Fire once when the deals surface is viewed, for CPA/promo negotiation data.
  useEffect(() => {
    track('deals_view')
  }, [])

  return (
    <section className="mb-14">
      <CodeCard />

      <h2 className="text-lg font-black uppercase tracking-wide mb-1">
        Partner retailers — <span className="text-lab-lime">live offers</span>
      </h2>
      <p className="text-lab-muted text-sm mb-5">
        Brands we have a real affiliate relationship with. These go to each retailer&apos;s own
        current sale and offers pages — not a fixed code — so what you see is whatever they&apos;re
        actually running right now.
      </p>
      <div className="grid sm:grid-cols-2 gap-4">
        <PartnerCard
          brand="MyProtein"
          blurb="Rotating sitewide sales plus the refer-a-friend code above. Strong on whey, clear whey and creatine value."
          href={myproteinLink()}
          tracked="myprotein"
        />
        <PartnerCard
          brand="Bulk"
          blurb="Frequent bundle and multi-buy deals. One of the better-scoring UK own-brand ranges on our tables."
          href={bulkDealsLink()}
          tracked="bulk"
        />
      </div>
    </section>
  )
}
