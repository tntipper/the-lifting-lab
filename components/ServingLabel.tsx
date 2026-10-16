import type { Nutrient } from '@/lib/products'
import GuidanceNote from './GuidanceNote'
import { SHOP_GUIDANCE } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

const nutrition = /^(calories|energy|protein|carbohydrates?|carbs|(?:of which )?sugars?|fat|(?:of which )?saturates|saturated fat|fibre|fiber|salt)$/i

// Group the original label rows without rewriting names, amounts or units.
export default function ServingLabel({ nutrients }: { nutrients: Nutrient[] }) {
  const groups = [
    { title: 'Per serving', rows: nutrients.filter(n => !nutrition.test(n.nutrient_name)) },
    { title: 'Nutrition per serving', rows: nutrients.filter(n => nutrition.test(n.nutrient_name)) },
  ]
  return <>{groups.filter(group => group.rows.length).map(group => <section key={group.title} className={styles.label}>
    <h3 className={styles.eyebrow}>{group.title}</h3>
    <dl>{group.rows.map((n, index) => <div key={`${n.nutrient_name}-${index}`}>
      <dt>{n.nutrient_name}</dt><dd>{n.amount}{n.unit}{n === nutrients.find(row => SHOP_GUIDANCE.caffeine.match.test(row.nutrient_name)) && <GuidanceNote nutrients={nutrients} />}</dd>
    </div>)}</dl>
  </section>)}</>
}
