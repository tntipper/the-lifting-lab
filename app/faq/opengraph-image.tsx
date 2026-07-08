import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement FAQ'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Straight Answers',
    title: 'Supplement FAQ',
    subtitle: 'How much, when to take, and what actually works — answered with the evidence.',
    tag: 'Answers',
  })
}
