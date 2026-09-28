'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { isSyntheticPreview } from '@/lib/preview-mode'
import { accountSignInHref } from '@/lib/identity/staging-customer-ui'
import { useLocalStack } from './LocalStackContext'
import { useStagingCart } from './StagingCartContext'

const SHOP_LINKS = [
  { href: '/products', label: 'Shop all' },
  { href: '/products?group=protein', label: 'Protein' },
  { href: '/products?category=creatine', label: 'Creatine' },
  { href: '/products?category=pre-workout', label: 'Pre-workout' },
  { href: '/products?category=hydration', label: 'Hydration' },
  { href: '/products?category=protein-bar', label: 'Bars' },
  { href: '/products?group=wellbeing', label: 'Health' },
]

const MORE_LINKS = [
  { href: '/best', label: 'Research' },
  { href: '/value', label: 'Value review' },
  { href: '/deals', label: 'Deals' },
  { href: '/brand', label: 'Brands' },
  { href: '/compare', label: 'Compare' },
  { href: '/wizard', label: 'Find My Stack' },
  { href: '/calculators', label: 'Calculators' },
]

function BasketControl() {
  const cart = useStagingCart()
  const quantity = cart?.view && ['empty', 'ready', 'held', 'pending'].includes(cart.view.state) ? cart.view.quantity : 0
  const classes = 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-lab-lime px-3 text-xs font-black text-black transition-transform hover:-translate-y-px sm:min-h-14 sm:gap-3 sm:px-6 sm:text-base'
  if (cart?.enabled) {
    return <button type="button" onClick={cart.open} className={classes} aria-label={`Basket, ${quantity} items`}>
      <span className="max-[480px]:hidden">Basket</span><span className="font-mono">{quantity}</span>
    </button>
  }
  return <Link href="/cart" className={classes} aria-label="Basket, 0 items"><span className="max-[480px]:hidden">Basket</span><span className="font-mono">0</span></Link>
}

export default function TopNav({ signedInInitial }: { signedInInitial?: boolean } = {}) {
  const pathname = usePathname()
  const { stack } = useLocalStack()
  const menuButton = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signedIn, setSignedIn] = useState<boolean | null>(signedInInitial ?? null)

  useEffect(() => {
    if (signedInInitial !== undefined) return
    createClient().auth.getUser().then(({ data }) => setSignedIn(Boolean(data.user))).catch(() => setSignedIn(false))
  }, [signedInInitial])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  const accountHref = isSyntheticPreview() ? '/preview' : signedIn === false ? accountSignInHref() : '/account'
  const accountLabel = isSyntheticPreview() ? 'Preview information' : signedIn === false ? 'Sign In' : 'My Account'

  return <header onKeyDown={(event) => {
    if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
  }} className="tll-on-dark sticky top-0 z-40 border-b border-[#2a2c26] bg-[#0d0d0d] text-white">
    <div className="mx-auto max-w-[1920px] px-3 sm:px-7">
      <div className="flex min-h-[84px] items-center justify-between gap-3 border-b border-[#2a2c26] sm:min-h-[116px]">
        <Link href="/" className="grid shrink-0 select-none text-white" aria-label="THE LIFTINGLAB">
          <span className="ml-[42%] text-[9px] font-black uppercase leading-none tracking-[.08em] sm:text-[11px]">The</span>
          <span className="tll-display mt-0.5 text-[23px] uppercase leading-[.78] tracking-[.035em] sm:text-[38px]">Lifting <span className="text-lab-lime">Lab</span></span>
        </Link>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <Link href="/stack" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#6c6f63] px-2.5 text-xs font-black text-white sm:min-h-14 sm:gap-3 sm:px-6 sm:text-base">
            <span className="hidden sm:inline">My </span><span className="max-[480px]:hidden">stack</span><span className="font-mono text-lab-lime">{stack.length}</span>
          </Link>
          <BasketControl />
          <Link href={accountHref} aria-label={accountLabel} title={accountLabel}
            className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] text-base text-white xl:hidden">
            <span aria-hidden="true">●</span>
          </Link>
          <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls={menuId} aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] sm:h-12 sm:w-12 xl:hidden">
            <span aria-hidden="true" className="text-xl">{menuOpen ? '×' : '≡'}</span>
          </button>
        </div>
      </div>

      <div className="hidden min-h-[70px] items-center justify-between gap-8 xl:flex">
        <nav aria-label="Shop categories" className="flex items-center gap-8 xl:gap-10">
          {SHOP_LINKS.map(({ href, label }, index) => <Link key={href} href={href} aria-label={index === 0 ? 'Browse' : undefined}
            className="inline-flex min-h-11 items-center whitespace-nowrap text-[15px] font-bold text-white transition-colors hover:text-lab-lime xl:text-[17px]">{label}</Link>)}
          <a href="https://theliftinglab.app" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center whitespace-nowrap text-[15px] font-bold text-lab-lime xl:text-[17px]">LIFT App ↗</a>
        </nav>
        <Link href={accountHref} className="text-sm font-bold text-[#a9ac9f] hover:text-white">{accountLabel}</Link>
      </div>

      {menuOpen && <div id={menuId} className="border-t border-[#2a2c26] py-4 xl:hidden">
        <nav aria-label="Mobile navigation" className="grid gap-1 sm:grid-cols-2">
          {[...SHOP_LINKS, ...MORE_LINKS].map(({ href, label }, index) => <Link key={`${href}-${label}`} href={href} aria-label={index === 0 ? 'Browse' : undefined}
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-white hover:bg-[#151613] hover:text-lab-lime">{label}</Link>)}
          <a href="https://theliftinglab.app" target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-lab-lime">LIFT App ↗</a>
          <Link href={accountHref} className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-white">{accountLabel}</Link>
        </nav>
      </div>}
    </div>
  </header>
}
