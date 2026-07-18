import { OG_SIZE, OG_CONTENT_TYPE, renderOgCard } from '@/lib/og-card'

export const runtime = 'edge'
export const alt = 'The Lifting Lab — BMI Calculator (and why it lies to lifters)'
export const size = OG_SIZE
export const contentType = OG_CONTENT_TYPE

export default function Image() {
  return renderOgCard({
    eyebrow: 'Free Tool',
    title: 'BMI Calculator',
    subtitle: 'Get your BMI in seconds — then see why it misjudges muscular lifters and what to use instead.',
    tag: 'Calculators',
  })
}
