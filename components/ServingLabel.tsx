import Link from 'next/link'
import type { Nutrient } from '@/lib/products'
import GuidanceNote from './GuidanceNote'
import { SHOP_GUIDANCE } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

const nutrition = /^(calories|energy|protein|carbohydrates?|carbs|(?:of which )?sugars?|fat|(?:of which )?saturates|saturated fat|fibre|fiber|salt)$/i

// Group the original label rows without rewriting names, amounts or units.
export default function ServingLabel({ nutrients, maxRows, productHref }: { nutrients: Nutrient[]; maxRows?: number; productHref?: string }) {
  const groups = [
    { title: 'Per serving', rows: nutrients.filter(n => !nutrition.test(n.nutrient_name)) },
    { title: 'Nutrition per serving', rows: nutrients.filter(n => nutrition.test(n.nutrient_name)) },
  ]
  const ordered = groups.flatMap(group => group.rows)
  const shown = new Set(ordered.slice(0, maxRows ?? ordered.length))
  const remaining = ordered.length - shown.size
  const caffeine = nutrients.find(row => SHOP_GUIDANCE.caffeine.match.test(row.nutrient_name))
  return <>{groups.map(group => ({ ...group, rows: group.rows.filter(row => shown.has(row)) })).filter(group => group.rows.length).map(group => <section key={group.title} className={styles.label}>
    <h3 className={styles.eyebrow}>{group.title}</h3>
    <dl>{group.rows.map((n, index) => <div key={`${n.nutrient_name}-${index}`}>
      <dt>{n.nutrient_name}</dt><dd>{n.amount}{n.unit}{n === caffeine && <GuidanceNote nutrients={nutrients} />}</dd>
    </div>)}</dl>
  </section>)}{remaining > 0 && productHref && <Link href={productHref} className="inline-flex items-center text-sm underline">+{remaining} more</Link>}</>
}
