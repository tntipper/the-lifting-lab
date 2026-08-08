import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Supplement Myths vs Facts'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Myth vs Fact',
    title: 'Supplement Myths vs Facts',
    subtitle:
      'Creatine and hair loss, test boosters, BCAAs, fat burners — the biggest claims, each given an honest evidence-based verdict.',
    tag: 'Myths 2026',
  })
}
