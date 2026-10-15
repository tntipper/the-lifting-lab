import type { Nutrient } from '@/lib/products'
import { aboveGuidance } from '@/lib/shop-guidance'
import styles from '@/components/shop.module.css'

export default function GuidanceNote({ nutrients }: { nutrients: Nutrient[] }) {
  const notes = aboveGuidance(nutrients)
  if (!notes.length) return null
  return <aside role="note" className={styles.guidance}>
    <b>Above UK guidance</b>
    {notes.map(note => <p key={note.source}>{note.text} <a href={note.source} target="_blank" rel="noopener noreferrer">Source ↗</a></p>)}
  </aside>
}
