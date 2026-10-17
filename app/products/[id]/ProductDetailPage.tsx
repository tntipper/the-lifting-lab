'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import InformedSportIcon from '@/components/InformedSportIcon'
import { scoreColor } from '@/components/ScoreBadge'
import ProductWarnings from '@/components/ProductWarnings'
import ShopScoreBadge from '@/components/ShopScoreBadge'
import styles from '@/components/shop.module.css'
import { assessmentDisplayFor, hasApprovedAssessment } from '@/lib/assessment-display'
import ProductImage from '@/components/ProductImage'
import { categoryLabel } from '@/lib/categories'
import { brandSlug } from '@/lib/brands'
import ProductSizePicker from '@/components/ProductSizePicker'
import { productForSize, selectProductSize, sizeSelectionUrl } from '@/lib/commerce/size-selection'
import ProductVariantPicker from '@/components/ProductVariantPicker'
import { flavourSlug, variantSelectionUrl } from '@/lib/commerce/variant-selection'
import GuidanceNote from '@/components/GuidanceNote'
import { SHOP_GUIDANCE } from '@/lib/shop-guidance'
import ProductOfferLink from '@/components/ProductOfferLink'
import { amazonSearch, bulkSearch } from '@/lib/affiliate'
import { isSyntheticPreview } from '@/lib/preview-mode'
import { track } from '@/lib/gtag'
import { displayPrice } from '@/lib/commerce/display-price'
import { formatListedServingPrice, trueCostReason, type ComparedProduct, type ScoredProduct } from '@/lib/products'
import { verdictFlags, nutrientColor } from '@/lib/scoring-utils'
import { useLocalStack } from '@/components/LocalStackContext'
import MethodologyModal from '@/components/MethodologyModal'
import ClaimsReviewNotice from '@/components/ClaimsReviewNotice'
import { claimsReviewFor } from '@/lib/claims-review'
import ReviewSection from '@/components/ReviewSection'
import ShareModal from '@/components/ShareModal'
import TopNav from '@/components/TopNav'
import RelatedProducts from './RelatedProducts'

function getRetailerLinks(brand: string, name: string): { label: string; url: string; affiliate: boolean }[] {
  if (isSyntheticPreview()) return []
  const q = encodeURIComponent(`${brand} ${name}`)
  const links: { label: string; url: string; affiliate: boolean }[] = []

  if (brand.toLowerCase() !== 'bulk') {
    links.push({ label: 'Amazon UK', url: amazonSearch(brand, name), affiliate: true })
  }
  if (brand.toLowerCase() !== 'myprotein') {
    links.push({ label: 'MyProtein', url: `https://www.myprotein.com/sport-nutrition/search.list?q=${q}`, affiliate: false })
  }
  links.push({ label: 'The Protein Works', url: `https://www.theproteinworks.com/search?query=${q}`, affiliate: false })
  if (brand.toLowerCase() !== 'bulk') {
    links.push({
      label: 'Bulk.com',
      url: bulkSearch(name),
      affiliate: true,
    })
  }
  return links.slice(0, 4)
}

// The product (with nutrients) and the same-category related list arrive as
// props from the server component in page.tsx, so this renders real content on
// the server — no client fetch, no "Loading…" shell. Interactivity (stack,
// share, tracking, reviews) hydrates on top.
export default function ProductDetailPage({
  product: originalProduct,
  related,
  defaultVariantId,
}: {
  product: ComparedProduct
  related: ScoredProduct[]
  defaultVariantId?: string
}) {
  const router = useRouter()
  const sizes = originalProduct.sizeOptions ?? []
  const [sizeSlug, setSizeSlug] = useState<string | undefined>(sizes[0]?.slug)
  const [sizeReady, setSizeReady] = useState(sizes.length <= 1)
  const variants = originalProduct.storeVariants ?? []
  const [selectedId, setSelectedId] = useState(defaultVariantId)
  // Until the URL selection is applied, a multi-variant page must not link any variant's cart.
  const [selectionReady, setSelectionReady] = useState(variants.length <= 1)
  useEffect(() => {
    setSizeSlug(selectProductSize(sizes, window.location.search)?.slug)
    setSizeReady(true)
    const query = new URLSearchParams(window.location.search)
    const flavour = query.get('flavour')
    const override = variants.find(v => v.variantId === query.get('variant'))
      ?? (flavour ? variants.find(v => v.flavour && flavourSlug(v.flavour) === flavourSlug(flavour)) : undefined)
    if (override) setSelectedId(override.variantId)
    setSelectionReady(true)
    // Read the URL once after hydration. Manual changes must never reset from props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const selected = variants.find(v => v.variantId === selectedId) ?? variants[0]
  const size = sizes.find(option => option.slug === sizeSlug) ?? sizes[0]
  // Multiple sizes have exact variant identities, not a size × flavour cross-product.
  // A sole size may still have several flavours, so keep their picker/projection.
  const sizeOwnsOffer = !!size && (sizes.length > 1 || variants.length <= 1)
  const baseProduct = size ? productForSize(originalProduct, size, sizeReady) : originalProduct
  const variantProduct = selected ? { ...baseProduct, storeVariants: undefined,
    storeLinkMapping: selectionReady ? selected.mapping : null, storePrice: selected.storePrice, buy_url: null,
    retail_price: selected.storePrice?.price ?? null,
    // Catalogue serving counts do not establish the selected variant's pack servings.
    cost_per_serving: variants.length === 1 ? baseProduct.cost_per_serving : null } : baseProduct
  const product = sizeOwnsOffer ? baseProduct : variantProduct
  const price = displayPrice(product)
  function changeSize(slug: string) {
    if (!sizes.some(option => option.slug === slug)) return
    setSizeSlug(slug)
    window.history.replaceState(null, '', sizeSelectionUrl(window.location.href, slug))
  }
  function changeVariant(id: string) {
    if (!variants.some(v => v.variantId === id)) return
    setSelectedId(id)
    window.history.replaceState(null, '', variantSelectionUrl(window.location.href, id))
  }
  const { inStack, toggle, state: stackState } = useLocalStack()
  const [shareOpen, setShareOpen] = useState(false)

  const review = claimsReviewFor(product.category)
  const assessment = assessmentDisplayFor(product)
  const canRecommend = hasApprovedAssessment(product)
  const costReason = trueCostReason(product)
  const flags = verdictFlags(product.nutrients, product.score, product.informed_sport)
    .filter(flag => canRecommend || flag.kind === 'safety')
  const color = canRecommend && product.score != null ? scoreColor(product.score) : '#9ca3af'
  const stacked = inStack(product.id)
  const retailers = variants.length ? [] : getRetailerLinks(product.brand, product.name)

  return (
    <div data-theme="lab" className={`${styles.detail} min-h-screen pb-80 md:pb-52`}>
      <TopNav />

      {/* breadcrumb / back row */}
      <div className="mx-auto flex max-w-[1200px] items-center gap-3 border-b border-lab-border px-4 py-3">
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

      <main className={styles.detailMain}>
        {/* hero */}
        <div className={styles.detailHero}>
          <div className={styles.detailPackshot}>
            <div className={styles.detailImage}>
              <ProductImage src={product.image_url} alt={`${product.brand} ${product.name}`} fill sizes="(max-width: 759px) calc(100vw - 82px), (max-width: 1023px) 40vw, 432px" />
            </div>
            <ShopScoreBadge product={product} />
          </div>
          <div className={styles.detailIntro}>
            <div className={styles.brandLine}><Link
              href={`/brand/${brandSlug(product.brand)}`}
              className="text-lab-muted text-xs uppercase tracking-widest hover:text-lab-lime transition-colors"
            >
              {product.brand}
            </Link><InformedSportIcon certified={product.informed_sport} /></div>
            <h1 className="tll-display">{product.name}</h1>
            <ClaimsReviewNotice category={product.category} />
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                {categoryLabel(product.category)}
              </span>
              {product.protein_yield != null && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-lab-panel-2 text-lab-muted px-2 py-0.5 rounded-full">
                  {product.protein_yield}% protein yield
                </span>
              )}
              {product.proprietary_blend && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-yellow-900/40 text-yellow-400 border border-yellow-700/50 px-2 py-0.5 rounded-full">
                  Proprietary Blend
                </span>
              )}
              {product.amino_spiked && (
                <span className="text-[10px] uppercase tracking-widest font-bold bg-red-900/40 text-red-400 border border-red-700/50 px-2 py-0.5 rounded-full">
                  Amino Spiked
                </span>
              )}
            </div>
            <div className={styles.priceBox}>
              <div className={styles.primaryPrice}><span>Price</span><b>{price !== null ? `£${price.toFixed(2)}` : 'Not listed'}</b></div>
              <div><span>True cost</span><b title={costReason ?? undefined}>{product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : 'Not listed'}</b></div>
              <div><span>Per serving</span><b>{product.cost_per_serving != null ? formatListedServingPrice(product.cost_per_serving) : '—'}</b></div>
            </div>
            <p className="font-mono text-xs text-lab-muted">
              {product.serving_size != null
                ? `${product.serving_size}${product.serving_unit ?? ''} per serving`
                : 'Serving size not on file'}
              {' · '}
              {product.servings_per_container != null
                ? `${product.servings_per_container} servings per container`
                : 'servings per container unknown'}
            </p>
          <button
            onClick={() => setShareOpen(true)}
            className="text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-lg border border-lab-border text-lab-muted hover:text-lab-lime hover:border-lab-lime/50 transition-colors"
          >
            ↗ Share & earn 25 pts
          </button>
          </div>
        </div>

        <ProductWarnings product={product} />

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

        <div className={styles.detailColumns}>
        {/* nutrient label */}
        {product.nutrients.length > 0 && (
          <div className={styles.detailPanel}>
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-4">Full Label</p>
            <div>
              {product.nutrients.map((n, i) => {
                const nColor = canRecommend ? nutrientColor(n.nutrient_name, n.amount) : null
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
                    <span className="font-mono font-semibold text-white ml-2 shrink-0">{n.amount}{n.unit}{i === product.nutrients.findIndex(row => SHOP_GUIDANCE.caffeine.match.test(row.nutrient_name)) && <GuidanceNote nutrients={product.nutrients} />}</span>
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

        {stackState.error && <p role="alert" className="text-sm text-lab-muted">{stackState.error}</p>}
        {/* score explanation */}
        {!assessment.suppressed && <div className={styles.detailPanel}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted">Score Explained</p>
            <MethodologyModal category={product.category} />
          </div>
          <p className="text-sm text-white/70 leading-relaxed">
            {!canRecommend ? assessment.explanation : <>
            TLL Label Score:{' '}
            <span className="font-bold" style={{ color }}>{product.score ?? '–'}/100</span> for {categoryLabel(product.category).toLowerCase()}. The score compares stated doses with amounts used in published research and checks label transparency.
            </>}
          </p>
          {canRecommend && <div className="flex gap-3 mt-3 flex-wrap">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-lab-lime/10 text-lab-lime border border-lab-lime/30">● Green = meets dose</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">● Amber = below optimal</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/30">● Red = significantly underdosed</span>
          </div>}
        </div>}

        </div>
        {/* better-rated alternatives in the same category */}
        {!review && <RelatedProducts items={related} productId={product.id} category={product.category} score={product.score} brand={product.brand} name={product.name} />}

        {/* reviews */}
        <ReviewSection productId={product.id} productName={product.name} />

        {/* Explicit retailer searches, separate from a product offer. */}
        {retailers.length > 0 && <div className={styles.detailPanel}>
          <p className="text-[11px] uppercase tracking-widest font-bold text-lab-muted mb-1">Search other retailers</p>
          <p className="text-xs text-gray-500 mb-4">
            Retailer searches do not confirm the exact product, pack, price or stock.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {retailers.map((r) => (
              <a
                key={r.label}
                href={r.url}
                target="_blank"
                rel={r.affiliate ? 'noopener noreferrer nofollow sponsored' : 'noopener noreferrer nofollow'}
                onClick={() => track('retailer_search_click', { retailer: r.label })}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-lab-border hover:border-lab-lime/50 hover:bg-lab-lime/5 transition-colors group"
              >
                <span className="text-white text-xs font-medium">{r.label}</span>
                <span className="text-lab-muted text-[10px] text-right group-hover:text-lab-lime transition-colors">
                  Search ↗<br />{r.affiliate ? 'Affiliate link · we may earn a commission' : 'External link'}
                </span>
              </a>
            ))}
          </div>
        </div>}
      </main>

      {/* sticky action bar */}
      <div className={`${styles.buyBar} tll-on-dark fixed bottom-0 inset-x-0 z-30`}>
        <div className={styles.buyBarInner}>
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
            {stacked ? 'In stack' : 'Add to stack'}
          </button>
          <Link
            href="/compare"
            className="text-[10px] font-black uppercase tracking-widest py-2.5 rounded-lg border border-lab-border text-lab-muted hover:text-white text-center transition-colors"
          >
            Compare
          </Link>
          <div className="min-w-0 space-y-2">
            {size && <ProductSizePicker options={sizes} selected={size} onChange={changeSize} price={product.retail_price} />}
            {!sizeOwnsOffer && selected && <ProductVariantPicker productId={product.id} cataloguePresentation={product.cataloguePresentation} variants={variants} selected={selected} onChange={changeVariant} />}
            <ProductOfferLink comingSoonWhenNotSold
              product={product}
              variantLabel={sizeOwnsOffer ? size?.label : selected?.label}
              pickerOwnsStatus={!sizeOwnsOffer && !!selected} chooseAnother={sizeOwnsOffer ? sizes.length > 1 : variants.length > 1}
              className="text-[10px] uppercase tracking-widest font-bold bg-lab-lime text-black rounded-lg hover:opacity-90 text-center py-2.5"
            />
          </div>
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        productId={product.id}
        productName={product.name}
        brand={product.brand}
      />
    </div>
  )
}
