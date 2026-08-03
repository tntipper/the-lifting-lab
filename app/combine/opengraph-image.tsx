import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Combination Checker'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'Can I Take These Together?',
    subtitle: 'Honest, evidence-based verdicts on combining your supplements — plus the caffeine and double-dosing traps most sites skip.',
    tag: 'Tools',
  })
}
