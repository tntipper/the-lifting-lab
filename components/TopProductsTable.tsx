import InformedSportIcon from '@/components/InformedSportIcon'
import shopStyles from '@/components/shop.module.css'
import Link from 'next/link'
import { formatListedServingPrice, type ScoredProduct } from '@/lib/products'
import { assessmentDisplayFor } from '@/lib/assessment-display'
import { displayPrice, isStoreOffer, isUsablePrice } from '@/lib/commerce/display-price'
import styles from './ShopHome.module.css'

export default function TopProductsTable({ products }: { products: ScoredProduct[] }) {
  const assessed = products.filter((product) => assessmentDisplayFor(product).score !== null)
  const rows = (assessed.length ? [...assessed].sort((a, b) =>
    (assessmentDisplayFor(b).score ?? 0) - (assessmentDisplayFor(a).score ?? 0)) : [...products].sort((a, b) =>
    a.brand.localeCompare(b.brand) || a.name.localeCompare(b.name))).slice(0, 5)

  return <section aria-labelledby="top-products-heading" className={styles.section}>
    <div className={styles.sectionHeader}>
      <h2 id="top-products-heading">Top scored this month</h2>
      <Link href="/products" className={styles.textLink}>See all <span className={styles.number}>&nbsp;{products.length}&nbsp;</span> products</Link>
    </div>
    {assessed.length === 0 && <p className={styles.note}>Approved scores are currently unavailable. Browse these catalogue records alphabetically while assessments are under review.</p>}
    <div className={styles.rows}>
      {rows.length === 0 && <p className="p-6 text-sm">Product records are currently unavailable. Please check again later.</p>}
      {rows.map((product, index) => {
        const assessment = assessmentDisplayFor(product)
        const packPrice = displayPrice(product)
        const score = assessment.score
        const band = score !== null && score < 50 ? styles.low : score !== null && score < 70 ? styles.mid : ''
        return <article key={product.id} className={styles.row}>
          <div className={styles.productName}>
            <span className={styles.rank}>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <div className={shopStyles.brandLine}><div className={styles.brand}>{product.brand}</div><InformedSportIcon certified={product.informed_sport} sourceUrl={product.informed_sport_source_url} /></div>
              <h3>{product.name}</h3>
            </div>
          </div>
          <div className={styles.productData}>
            {score !== null ? <span className={`${styles.score} ${band}`} title={`Effectiveness match ${score} out of 100`}>
              {score} / 100 <small>{score >= 70 ? 'Strong' : score >= 50 ? 'Moderate' : 'Weak'}</small>
            </span> : <span className={styles.note}>{assessment.label}</span>}
            <div className={styles.price}>
              <div className={`${styles.priceLabel} whitespace-nowrap`}>{isStoreOffer(product) ? 'TLL Store price' : 'Listed price'}</div>
              <div className={`${styles.priceValue} whitespace-nowrap`}>{isUsablePrice(packPrice) ? `£${packPrice.toFixed(2)}` : 'Not listed'}</div>
              <div className={styles.priceLabel}>Listed / serving</div>
              <div className={styles.priceValue}>{product.cost_per_serving !== null ? formatListedServingPrice(product.cost_per_serving) : 'Unavailable'}</div>
            </div>
            <Link href={`/products/${product.id}`} className={styles.button} aria-label={`View ${product.brand} ${product.name}`}>View</Link>
          </div>
        </article>
      })}
    </div>
  </section>
}
