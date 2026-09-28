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
  const classes = 'inline-flex min-h-11 items-center gap-2 rounded-lg bg-lab-lime px-3 text-sm font-semibold text-black'
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
  const compactResearchHeader = pathname === '/stack' || pathname === '/sources'

  return <header onKeyDown={(event) => {
    if (event.key === 'Escape' && menuOpen) { setMenuOpen(false); menuButton.current?.focus() }
  }} className="tll-on-dark sticky top-0 z-40 border-b border-[#2a2c26] bg-[#0d0d0d] text-white">
    <div className="mx-auto max-w-[1200px] px-4">
      <div className="flex min-h-[60px] items-center justify-between gap-3">
        <Link href="/" className="flex min-h-11 shrink-0 items-center" aria-label="THE LIFTINGLAB">
          <img src="/brand/tll-wordmark.png" alt="The Lifting Lab" className="block h-auto w-[100px] sm:h-[26px] sm:w-auto" />
        </Link>

        {compactResearchHeader ? <nav aria-label="Main" className="hide-scroll flex min-w-0 items-center gap-1 overflow-x-auto">
          <Link href="/stack" aria-current={pathname === '/stack' ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center border-b-2 px-2.5 text-sm font-medium text-white ${pathname === '/stack' ? 'border-lab-lime' : 'border-transparent'}`}>Stack builder</Link>
          <Link href="/sources" aria-current={pathname === '/sources' ? 'page' : undefined} className={`flex min-h-11 shrink-0 items-center border-b-2 px-2.5 text-sm font-medium text-white ${pathname === '/sources' ? 'border-lab-lime' : 'border-transparent'}`}>Research sources</Link>
          <Link href="/products" className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-sm font-medium text-white">Shop</Link>
          <a href="https://www.trylift.app" target="_blank" rel="noopener" className="flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-2.5 text-sm font-semibold text-lab-lime">LIFT App ↗</a>
        </nav> : <div className="flex items-center gap-2">
          <Link href="/stack" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#6c6f63] px-2.5 text-xs font-black text-white sm:min-h-14 sm:gap-3 sm:px-6 sm:text-base">
            <span className="hidden sm:inline">My </span><span className="max-[480px]:hidden">stack</span><span className="font-mono text-lab-lime">{stack.length}</span>
          </Link>
          <BasketControl />
          <Link href={accountHref} aria-label={accountLabel} title={accountLabel}
            className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] text-base text-white xl:hidden">
            <span aria-hidden="true">●</span>
          </Link>
          <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls={menuId} aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] xl:hidden">
            <span aria-hidden="true" className="text-xl">{menuOpen ? '×' : '≡'}</span>
          </button>
        </div>}
      </div>

      {!compactResearchHeader && <div className="flex min-h-11 items-center justify-between gap-3 border-t border-[#2a2c26]">
        <nav aria-label="Shop categories" className="hide-scroll flex min-w-0 items-center gap-1 overflow-x-auto">
          {SHOP_LINKS.map(({ href, label }, index) => <Link key={href} href={href} aria-label={index === 0 ? 'Browse' : undefined}
            className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-2.5 text-sm font-medium text-white ${pathname === '/products' && index === 0 ? 'border-lab-lime' : 'border-transparent'}`}>{label}</Link>)}
          <a href="https://www.trylift.app" target="_blank" rel="noopener" className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 border-transparent px-2.5 text-sm font-semibold text-lab-lime">LIFT App ↗</a>
        </nav>
        <Link href={accountHref} className="hidden shrink-0 text-sm font-medium text-[#a9ac9f] hover:text-white xl:block">{accountLabel}</Link>
      </div>}

      {!compactResearchHeader && menuOpen && <div id={menuId} className="border-t border-[#2a2c26] py-4 xl:hidden">
        <nav aria-label="Mobile navigation" className="grid gap-1 sm:grid-cols-2">
          {MORE_LINKS.map(({ href, label }) => <Link key={`${href}-${label}`} href={href}
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-white hover:bg-[#151613] hover:text-lab-lime">{label}</Link>)}
          <a href="https://www.trylift.app" target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-lab-lime">LIFT App ↗</a>
          <Link href={accountHref} className="flex min-h-11 items-center rounded-md px-3 text-sm font-bold text-white">{accountLabel}</Link>
        </nav>
      </div>}
    </div>
  </header>
}
