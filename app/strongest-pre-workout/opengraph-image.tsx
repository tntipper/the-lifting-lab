import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — Strongest Pre-Workouts'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Ranked by Caffeine',
    title: 'Strongest Pre-Workouts',
    subtitle: 'UK pre-workouts ranked by caffeine per serving, with the 400mg safety line.',
    tag: 'UK 2026',
  })
}
