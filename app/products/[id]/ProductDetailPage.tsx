'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ScoreBadge, { scoreColor } from '@/components/ScoreBadge'
import ProductImage from '@/components/ProductImage'
import { categoryLabel } from '@/lib/categories'
import { brandSlug } from '@/lib/brands'
import { buyLink } from '@/lib/affiliate'
import { track } from '@/lib/gtag'
import { trueCostReason, type ComparedProduct, type ScoredProduct } from '@/lib/products'
import { verdictFlags, nutrientColor } from '@/lib/scoring-utils'
import { useLocalStack } from '@/components/LocalStackContext'
import MethodologyModal from '@/components/MethodologyModal'
import ReviewSection from '@/components/ReviewSection'
import ShareModal from '@/components/ShareModal'
import TopNav from '@/components/TopNav'
import RelatedProducts from './RelatedProducts'

function getRetailerLinks(brand: string, name: string): { label: string; url: string }[] {
  const q = encodeURIComponent(`${brand} ${name}`)
  const links: { label: string; url: string }[] = []

  if (brand.toLowerCase() !== 'bulk') {
    links.push({ label: 'Amazon UK', url: `https://www.amazon.co.uk/s?k=${q}&tag=theliftinglab-21` })
  }
  if (brand.toLowerCase() !== 'myprotein') {
    links.push({ label: 'MyProtein', url: `https://www.myprotein.com/sport-nutrition/search.list?q=${q}` })
  }
  links.push({ label: 'The Protein Works', url: `https://www.theproteinworks.com/search?query=${q}` })
  if (brand.toLowerCase() !== 'bulk') {
    links.push({
      label: 'Bulk.com',
      url: `https://www.awin1.com/cread.php?awinmid=4822&awinaffid=2919631&ued=${encodeURIComponent(`https://www.bulk.com/uk/search?q=${encodeURIComponent(name)}`)}`
    })
  }
  return links.slice(0, 4)
}

// The product (with nutrients) and the same-category related list arrive as
// props from the server component in page.tsx, so this renders real content on
// the server — no client fetch, no "Loading…" shell. Interactivity (stack,
// share, tracking, reviews) hydrates on top.
export default function ProductDetailPage({
  product,
  related,
}: {
  product: ComparedProduct
  related: ScoredProduct[]
}) {
  const router = useRouter()
  const { inStack, toggle } = useLocalStack()
  const [shareOpen, setShareOpen] = useState(false)

  const costReason = trueCostReason(product)
  const flags = verdictFlags(product.nutrients, product.score, product.informed_sport)
  const color = product.score != null ? scoreColor(product.score) : '#4b5563'
  const stacked = inStack(product.id)
  const retailers = getRetailerLinks(product.brand, product.name)

  return (
    <div className="min-h-screen bg-lab-bg text-white pb-32">
      <TopNav />

      {/* breadcrumb / back row */}
      <div className="bg-lab-bg border-b border-lab-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="text-lab-muted hover:text-white text-sm font-bold uppercase tracking-widest"
        >
          ← Back
        </button>
        <span className="text-lab-muted text-xs">|</span>
        <span className="text-lab-muted text-xs uppercase tracking-widest truncate">
          {categoryLabel(product.category)}
        </span>
      </div>

      <div className="max-w-2xl mx-auto px-4 pt-8 space-y-6">
        {/* hero */}
        <div className="flex flex-col items-center text-center gap-4">
          <div className="flex items-center gap-5">
            <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} size={110} />
            <ScoreBadge score={product.score} size="lg" />
          </div>
          <div>
            <Link
              href={`/brand/${brandSlug(product.brand)}`}
              className="text-lab-muted text-xs uppercase tracking-widest hover:text-lab-lime transition-colors"
            >
              {product.brand}
            </Link>
            <h1 className="text-2xl font-black italic mt-1">{product.name}</h1>
            <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                {categoryLabel(product.category)}
              </span>
              {product.informed_sport && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-green-900/50 text-green-400 border border-green-700/50 px-2 py-0.5 rounded-full">
                  🛡️ IS Certified
                </span>
              )}
              {product.protein_yield != null && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                  {product.protein_yield}% protein yield
                </span>
              )}
              {product.proprietary_blend && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded-full">
                  ⚠️ Proprietary Blend
                </span>
              )}
              {product.amino_spiked && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-red-900/40 text-red-400 border border-red-700/50 px-2 py-0.5 rounded-full">
                  ⚠️ Amino Spiked
                </span>
              )}
            </div>
            <p className="text-sm text-gray-400 mt-2">
              {product.retail_price != null ? <span>£{product.retail_price.toFixed(2)} retail</span> : <span>Retail price —</span>}
              <span className="mx-2">·</span>
              {product.cost_per_serving != null ? (
                <span className="text-white font-bold">£{product.cost_per_serving.toFixed(2)} True Cost / serving</span>
              ) : (
                <span title={costReason ?? undefined}>True Cost — <span className="text-xs">({costReason})</span></span>
              )}
            </p>
            <p className="text-xs text-lab-muted mt-1">
              {product.serving_size != null
                ? `${product.serving_size}${product.serving_unit ?? ''} per serving`
                : 'Serving size not on file'}
              {' · '}
              {product.servings_per_container != null
                ? `${product.servings_per_container} servings per container`
                : 'servings per container unknown'}
            </p>
          </div>
          <button
            onClick={() => setShareOpen(true)}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 transition-colors"
          >
            ↗ Share & earn 25 pts
          </button>
        </div>

        {/* verdict flags */}
        {flags.length > 0 && (
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-5 space-y-3">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-1">The Verdict</p>
            {flags.map((f, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="text-lg leading-none mt-0.5 shrink-0" style={{ color: f.color }}>●</span>
                <span className="text-sm text-white/90 leading-snug">{f.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* nutrient label */}
        {product.nutrients.length > 0 && (
          <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-4">Full Label</p>
            <div>
              {product.nutrients.map((n, i) => {
                const nColor = nutrientColor(n.nutrient_name, n.amount)
                return (
                  <div
                    key={i}
                    className={`flex justify-between items-center py-2.5 text-sm ${
                      i < product.nutrients.length - 1 ? 'border-b border-lab-border' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {nColor && (
                        <span className="text-xs leading-none shrink-0" style={{ color: nColor }}>●</span>
                      )}
                      <span className="text-white/80">{n.nutrient_name}</span>
                    </div>
                    <span className="font-bold text-white ml-2 shrink-0">{n.amount}{n.unit}</span>
                  </div>
                )
              })}
            </div>
            {product.servings_per_container && (
              <p className="text-xs text-lab-muted mt-3">
                {product.servings_per_container} servings · {product.serving_size}{product.serving_unit} per serving
              </p>
            )}
            <p className="text-[10px] text-lab-muted/60 mt-2 italic">
              Informational only — not medical advice.
            </p>
          </div>
        )}

        {/* score explanation */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Score Explained</p>
            <MethodologyModal category={product.category} />
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            This product scores{' '}
            <span className="font-bold" style={{ color }}>{product.score ?? '–'}/100</span> against our
            evidence-based reference spec for {categoryLabel(product.category).toLowerCase()}. Scores are based on
            dose-for-dose comparison against evidence-based targets — not brand reputation or marketing claims.
          </p>
          <div className="flex gap-3 mt-3 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lab-lime/10 text-lab-lime border border-lab-lime/30">● Green = meets dose</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">● Amber = below optimal</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">● Red = significantly underdosed</span>
          </div>
        </div>

        {/* better-rated alternatives in the same category */}
        <RelatedProducts items={related} productId={product.id} category={product.category} score={product.score} brand={product.brand} name={product.name} />

        {/* reviews */}
        <ReviewSection productId={product.id} productName={product.name} />

        {/* compare prices across retailers */}
        <div className="bg-lab-panel border border-lab-border rounded-2xl p-5">
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-1">Compare Prices</p>
          <p className="text-xs text-gray-500 mb-4">
            Search for this product across UK retailers — prices vary.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {retailers.map((r) => (
              <a
                key={r.label}
                href={r.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                onClick={() => track('retailer_click', { item_brand: product.brand, item_name: product.name, retailer: r.label })}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-lab-border hover:border-lab-lime/50 hover:bg-lab-lime/5 transition-colors group"
              >
                <span className="text-white text-xs font-medium">{r.label}</span>
                <span className="text-lab-muted text-xs group-hover:text-lab-lime transition-colors">Search →</span>
              </a>
            ))}
          </div>
          <p className="text-[10px] text-gray-600 mt-3">
            We may earn a commission on purchases via affiliate links. Check retailer for current pricing.
          </p>
        </div>
      </div>

      {/* sticky action bar */}
      <div className="fixed bottom-0 inset-x-0 z-30 bg-lab-panel-2 border-t border-lab-border">
        <div className="max-w-2xl mx-auto px-4 py-3 grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              toggle({ id: product.id, name: product.name, brand: product.brand, category: product.category, score: product.score })
              track(stacked ? 'remove_from_stack' : 'add_to_stack', { item_brand: product.brand, item_name: product.name })
            }}
            className={`text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg border transition-colors ${
              stacked
                ? 'border-lab-lime text-lab-lime bg-lab-lime/10'
                : 'border-lab-border text-lab-muted hover:text-white'
            }`}
          >
            {stacked ? '✓ In Stack' : '+ Stack'}
          </button>
          <Link
            href="/compare"
            className="text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white text-center transition-colors"
          >
            Compare
          </Link>
          <a
            href={buyLink(product.brand, product.name, product.buy_url)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            onClick={() => track('buy_click', { item_brand: product.brand, item_name: product.name })}
            className="text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black rounded-lg hover:opacity-90 text-center py-2.5"
          >
            Buy Now →
          </a>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        productId={product.id}
        productName={product.name}
        brand={product.brand}
        score={product.score}
      />
    </div>
  )
}
