import { createRoot } from 'react-dom/client'
import InformedSportIcon from '../../components/InformedSportIcon'
import TopNav from '../../components/TopNav'
import SiteFooter from '../../components/SiteFooter'
import ServingLabel from '../../components/ServingLabel'
import ProductOfferLink from '../../components/ProductOfferLink'
import type { StoreLinkMapping } from '../../lib/commerce/product-mapping'
import styles from '../../components/shop.module.css'

const now = Date.now()
const product = { id: 'fixture', brand: 'Fixture', name: 'Unchanged name', buy_url: null }
const mapping: StoreLinkMapping = { productId: 'fixture', shopifyProductHandle: 'fixture', shopifyVariantId: '123', active: true, approved: true,
  review: { approved: true, version: 'fixture', expectedVersion: 'fixture', verifiedAtMs: now - 1000, expiresAtMs: now + 3600000 } }
createRoot(document.getElementById('fixture')!).render(<>
  <TopNav signedInInitial={false} />
  <main className={`${styles.shop} p-4`}>
    <div className={styles.productGrid}>
      {[false, true].map(sellable => <article key={String(sellable)} className={`${styles.card} p-6 gap-3`}>
        <div className={styles.brandLine}><span>APPLIED NUTRITION</span>{sellable && <InformedSportIcon certified sourceUrl="https://example.com/certification" />}</div>
        <h1>{sellable ? 'Mapped product' : 'Unmapped product'}</h1>
        <ServingLabel nutrients={[{ nutrient_name: 'Caffeine', amount: 250, unit: 'mg' }]} />
        <div className={styles.cardActions}>
          <ProductOfferLink comingSoonWhenNotSold product={{ ...product, storeLinkMapping: sellable ? mapping : null }} className="w-full rounded-md bg-[var(--ink)] py-3 text-sm font-semibold uppercase tracking-wide text-[var(--lime)]" />
        </div>
      </article>)}
    </div>
  </main>
  <SiteFooter />
</>)
