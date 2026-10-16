import Link from 'next/link'
import { formatListedServingPrice, type ScoredProduct } from '@/lib/products'
import styles from './ShopHome.module.css'

const GROUPS = [
  { label: 'Creatine', categories: ['creatine'] },
  { label: 'Whey protein', categories: ['whey', 'whey-isolate'] },
  { label: 'Pre-workout', categories: ['pre-workout'] },
]

function lowestListed(products: ScoredProduct[], categories: string[]) {
  return products
    .filter((product) => categories.includes(product.category)
      && typeof product.cost_per_serving === 'number'
      && Number.isFinite(product.cost_per_serving)
      && product.cost_per_serving > 0)
    .sort((a, b) => (a.cost_per_serving ?? Infinity) - (b.cost_per_serving ?? Infinity))[0] ?? null
}

export default function ShopHero({ products, shopHref = '/products?sort=price' }: { products: ScoredProduct[]; shopHref?: string }) {
  return <section className={styles.hero} aria-labelledby="home-heading">
    <div className={styles.heroInner}>
      <div className={styles.heroCopy}>
        <span className={styles.eyebrow}>Dose records · UK prices · one basket</span>
        <h1 id="home-heading">Compare the dose. Then buy it in the same basket.</h1>
        <p>Compare recorded serving amounts and listed UK prices in one place, then keep your chosen products together in one Lifting Lab account.</p>
        <div className={styles.actions}>
          <Link href={shopHref} className={`${styles.button} ${styles.primary}`}>Shop by price</Link>
          <a href="#method" className={styles.button}>How we score</a>
        </div>
      </div>
      <aside className={styles.bestPanel} aria-label="Lowest listed cost per serving">
        <span className={styles.eyebrow}>Lowest listed cost per serving</span>
        {GROUPS.map(({ label, categories }) => {
          const product = lowestListed(products, categories)
          return <Link key={label} href={product ? `/products/${product.id}` : `/products?category=${categories[0]}`} className={styles.bestRow}>
            <span className={styles.bestCategory}>{label}</span>
            <span className={styles.bestCost}>{product ? formatListedServingPrice(product.cost_per_serving!) : '—'}</span>
            <span className={styles.bestName}>{product ? `${product.brand} ${product.name}` : 'No listed price available'}</span>
            <span className={styles.bestUnit}>per serving</span>
          </Link>
        })}
        <p className={styles.note}>Effective-serving assessments are under review. These are listed serving costs.</p>
      </aside>
    </div>
  </section>
}
