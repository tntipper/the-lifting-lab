'use client'

import { Suspense, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { isIsolatedEnvironment, isSyntheticPreview } from '@/lib/preview-mode'
import { accountSignInHref } from '@/lib/identity/staging-customer-ui'
import { useLocalStack } from './LocalStackContext'
import { useStagingCart } from './StagingCartContext'
import { useShopPanels } from './ShopPanelsContext'

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
  const panels = useShopPanels()
  const quantity = cart?.enabled && cart.view && ['empty', 'ready', 'held', 'pending'].includes(cart.view.state)
    ? cart.view.quantity
    : panels.basket.reduce((sum, line) => sum + line.quantity, 0)
  const classes = 'tll-basket inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#6c6f63] px-3 text-sm font-semibold'
  const open = () => { if (cart?.enabled) cart.open(); else panels.openBasket() }
  return <button type="button" onClick={open} aria-haspopup="dialog" className={classes} aria-label={`Basket, ${quantity} items`}>
    <span className="max-[359px]:hidden">Basket</span><span className="font-mono">{quantity}</span>
  </button>
}

function ShopNavigation({ pathname, query }: { pathname: string; query?: URLSearchParams }) {
  const selected = query?.get('category') || query?.get('group')
  return <nav aria-label="Shop categories" className="hide-scroll flex min-w-0 items-center gap-1 overflow-x-auto">
    {SHOP_LINKS.map(({ href, label }, index) => {
      const target = new URL(href, 'https://theliftinglab.co.uk')
      const active = pathname.startsWith('/products') && (index === 0 ? !selected : selected === (target.searchParams.get('category') || target.searchParams.get('group')))
      return <Link key={href} href={href} aria-label={index === 0 ? 'Browse' : undefined} aria-current={active ? 'page' : undefined} className={`tll-nav-item ${active ? 'is-active' : ''}`}>{label}</Link>
    })}
    <a href="https://www.trylift.app" target="_blank" rel="noopener" className="tll-nav-item tll-lift-link">LIFT App ↗</a>
  </nav>
}

function FilteredShopNavigation({ pathname }: { pathname: string }) {
  const query = useSearchParams()
  return <ShopNavigation pathname={pathname} query={query ?? undefined} />
}

export default function TopNav({ signedInInitial }: { signedInInitial?: boolean } = {}) {
  const pathname = usePathname()
  const { stack } = useLocalStack()
  const { openStack } = useShopPanels()
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
  }} className="tll-header tll-on-dark sticky top-0 z-40">
    <div className="mx-auto max-w-[1200px] px-4">
      <div className="flex min-h-[60px] flex-wrap items-center justify-between gap-x-3 gap-y-2 py-2">
        <Link href="/" className="flex min-h-11 shrink-0 items-center" aria-label="THE LIFTINGLAB">
          <img src="/brand/tll-wordmark.png" alt="The Lifting Lab" width="1030" height="215" className="block h-[26px] w-auto" />
        </Link>

        {compactResearchHeader ? <nav aria-label="Main" className="hide-scroll flex min-w-0 items-center gap-1 overflow-x-auto max-[640px]:w-full">
          <Link href="/stack" aria-current={pathname === '/stack' ? 'page' : undefined} className={`tll-nav-item ${pathname === '/stack' ? 'is-active' : ''}`}>Stack builder</Link>
          <Link href="/sources" aria-current={pathname === '/sources' ? 'page' : undefined} className={`tll-nav-item ${pathname === '/sources' ? 'is-active' : ''}`}>Research sources</Link>
          <Link href="/products" className="tll-nav-item">Shop</Link>
          <a href="https://www.trylift.app" target="_blank" rel="noopener" className="tll-nav-item tll-lift-link">LIFT App ↗</a>
        </nav> : <>
          <div className="order-2 flex w-full items-center gap-2 sm:order-none sm:ml-auto sm:w-auto">
            <BasketControl />
            <button type="button" onClick={openStack} aria-haspopup="dialog" aria-label={`My stack, ${stack.length} products`} className="tll-stack-button inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold">
              My stack <span className="font-mono">{stack.length}</span>
            </button>
          </div>
          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <Link href={accountHref} aria-label={accountLabel} title={accountLabel} className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] xl:hidden">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="3" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
            </Link>
            <button ref={menuButton} type="button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-controls={menuId} aria-expanded={menuOpen}
              onClick={() => setMenuOpen((value) => !value)} className="grid h-11 w-11 place-items-center rounded-lg border border-[#6c6f63] xl:hidden">
              <span aria-hidden="true" className="text-xl">{menuOpen ? '×' : '≡'}</span>
            </button>
          </div>
        </>}
      </div>

      {!compactResearchHeader && <div className="flex min-h-11 items-center justify-between gap-3 border-t border-[#2a2c26]">
        <Suspense fallback={<ShopNavigation pathname={pathname} />}><FilteredShopNavigation pathname={pathname} /></Suspense>
        <Link href={accountHref} className="hidden min-h-11 shrink-0 items-center text-sm font-medium text-[#a9ac9f] hover:text-white xl:inline-flex">{accountLabel}</Link>
      </div>}

      {!compactResearchHeader && menuOpen && <div id={menuId} className="border-t border-[#2a2c26] py-4 xl:hidden">
        <nav aria-label="Mobile navigation" className="grid gap-1 sm:grid-cols-2">
          {MORE_LINKS.map(({ href, label }) => <Link key={`${href}-${label}`} href={href}
            className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-white hover:bg-[#151613] hover:text-lab-lime">{label}</Link>)}
          <Link href={accountHref} className="flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-white">{accountLabel}</Link>
          <a href="https://www.trylift.app" target="_blank" rel="noopener" className="tll-nav-item tll-lift-link">LIFT App ↗</a>
        </nav>
      </div>}
    </div>
  </header>
}
