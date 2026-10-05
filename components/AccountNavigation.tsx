'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { stagingCartUiEnabled } from '@/lib/commerce/staging-cart-types'
import { stagingCustomerUiEnabled } from '@/lib/identity/staging-customer-ui'

const LINKS = [
  { href: '/account', label: 'Overview' },
  { href: '/favourites', label: 'Favourites' },
  { href: '/stack', label: 'My Stack' },
  { href: '/account/settings', label: 'Profile' },
] as const

export default function AccountNavigation() {
  const pathname = usePathname()
  const links = [
    LINKS[0],
    ...(stagingCustomerUiEnabled() ? [{ href: '/account/orders', label: 'Orders' }] : []),
    LINKS[1],
    LINKS[2],
    ...(stagingCartUiEnabled() ? [{ href: '/cart', label: 'Cart' }] : []),
    LINKS[3],
  ]

  return (
    <nav aria-label="My account" className="border-b border-lab-border">
      <div className="flex flex-wrap gap-x-1">
        {links.map(({ href, label }) => {
          const active = href === '/account' ? pathname === href || pathname === '/dashboard' : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`min-h-11 inline-flex items-center border-b-2 px-2.5 text-[10px] font-black uppercase tracking-widest transition-colors sm:px-3 sm:text-[11px] ${
                active
                  ? 'border-lab-lime text-lab-lime'
                  : 'border-transparent text-lab-muted hover:border-white/20 hover:text-white'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
