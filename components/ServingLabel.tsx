import Link from 'next/link'
import type { Nutrient } from '@/lib/products'
import GuidanceNote from './GuidanceNote'
import { SHOP_GUIDANCE } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

const nutrition = /^(calories|energy|protein|carbohydrates?|carbs|(?:of which )?sugars?|fat|(?:of which )?saturates|saturated fat|fibre|fiber|salt)$/i

// Group the original label rows without rewriting names, amounts or units.
export default function ServingLabel({ nutrients, maxRows, productHref, productName }: { nutrients: Nutrient[]; maxRows?: number; productHref?: string; productName?: string }) {
  const groups = [
    { title: 'Per serving', rows: nutrients.filter(n => !nutrition.test(n.nutrient_name)) },
    { title: 'Nutrition per serving', rows: nutrients.filter(n => nutrition.test(n.nutrient_name)) },
  ]
  const ordered = groups.flatMap(group => group.rows)
  const caffeine = nutrients.find(row => SHOP_GUIDANCE.caffeine.match.test(row.nutrient_name))
  const visible = ordered.slice(0, maxRows ?? ordered.length)
  // Preserve label ordering while reserving a capped row for the advisory.
  if (caffeine && !visible.includes(caffeine)) visible.splice(Math.max(0, visible.length - 1), 1, caffeine)
  const shown = new Set(visible)
  const remaining = ordered.length - shown.size
  return <>{groups.map(group => ({ ...group, rows: group.rows.filter(row => shown.has(row)) })).filter(group => group.rows.length).map(group => <section key={group.title} className={styles.label}>
    <h3 className={styles.eyebrow}>{group.title}</h3>
    <dl>{group.rows.map((n, index) => <div key={`${n.nutrient_name}-${index}`}>
      <dt>{n.nutrient_name}</dt><dd>{n.amount}{n.unit}{n === caffeine && <GuidanceNote nutrients={nutrients} />}</dd>
    </div>)}</dl>
  </section>)}{remaining > 0 && productHref && <Link href={productHref} className="inline-flex min-h-8 items-center text-sm underline" aria-label={`View ${remaining} more label rows for ${productName ?? 'this product'}`}>+{remaining} more</Link>}</>
}
