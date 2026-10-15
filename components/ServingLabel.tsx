import type { Nutrient } from '@/lib/products'
import styles from '@/app/products/shop.module.css'

const nutrition = /^(calories|energy|protein|carbohydrates?|carbs|(?:of which )?sugars?|fat|(?:of which )?saturates|saturated fat|fibre|fiber|salt)$/i

// Group the original label rows without rewriting names, amounts or units.
export default function ServingLabel({ nutrients }: { nutrients: Nutrient[] }) {
  const groups = [
    { title: 'Per serving', rows: nutrients.filter(n => !nutrition.test(n.nutrient_name)) },
    { title: 'Nutrition per serving', rows: nutrients.filter(n => nutrition.test(n.nutrient_name)) },
  ]
  return <>{groups.filter(group => group.rows.length).map(group => <section key={group.title} className={styles.label}>
    <h2 className={styles.eyebrow}>{group.title}</h2>
    <dl>{group.rows.map((n, index) => <div key={`${n.nutrient_name}-${index}`}>
      <dt>{n.nutrient_name}</dt><dd>{n.amount}{n.unit}</dd>
    </div>)}</dl>
  </section>)}</>
}
