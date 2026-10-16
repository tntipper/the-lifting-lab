import Link from 'next/link'
import AnalyticsPreferences from './AnalyticsPreferences'
import { isIsolatedEnvironment } from '@/lib/preview-mode'
import EmailCapture from './EmailCapture'
import FollowUs from './FollowUs'

const SHOP = [
  ['/products', 'Shop all'], ['/products?group=protein', 'Protein'], ['/products?category=creatine', 'Creatine'],
  ['/products?category=pre-workout', 'Pre-workout'], ['/products?category=hydration', 'Hydration'], ['/products?category=protein-bar', 'Bars'],
] as const

const RESEARCH = [
  ['/guide', 'Guides'],
  ['/sources', 'Research sources'], ['/methodology', 'How we assess'], ['/ingredients', 'Ingredients'],
  ['/compare', 'Compare'], ['/stack', 'Stack builder'], ['/calculators', 'Calculators'],
  ['/cheapest', 'Cheapest supplements'], ['/protein-value', 'Protein value'],
  ['/strongest-pre-workout', 'Strongest pre-workout'], ['/stacks', 'Stacks'],
] as const

export default function SiteFooter() {
  return <footer className="tll-footer tll-on-dark mt-auto">
    <div className="tll-footer-inner">
      <img src="/brand/tll-lockup.png" alt="The Lifting Lab" width="1040" height="600" className="h-12 w-auto max-w-full justify-self-start object-contain" />
      <div className="tll-footer-columns">
        <nav aria-label="Shop links"><h2>Shop</h2><ul>{SHOP.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul></nav>
        <nav aria-label="Research links"><h2>Research</h2><ul>{RESEARCH.map(([href, label]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul></nav>
      </div>
      <div className="tll-footer-blocks"><EmailCapture /><FollowUs /></div>
      <div className="tll-footer-legal">
        <p>Prices are recorded from UK retailers on the date shown with each price and may change. Dose ranges cite ISSN, NHS and EFSA sources where available. Informational only, not medical advice.</p>
        <p>THE LIFTING LAB LTD · Company no. 17497631</p>
        <nav aria-label="Legal">
          <Link href="/refunds">Refunds</Link><Link href="/delivery">Delivery</Link><Link href="/contact">Contact</Link><Link href="/privacy">Privacy</Link><Link href="/terms">Terms</Link><Link href="/affiliate-disclosure">Affiliate disclosure</Link>
          {!isIsolatedEnvironment() && <AnalyticsPreferences />}
        </nav>
      </div>
    </div>
  </footer>
}
