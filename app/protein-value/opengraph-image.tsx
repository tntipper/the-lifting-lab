import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Best Value Protein'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Cost Per Gram of Protein',
    title: 'Best Value Protein',
    subtitle: 'Which protein powders give you the most protein for your money.',
    tag: 'Value 2026',
  })
}
