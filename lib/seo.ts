import type { Metadata } from 'next'
import type { ScoredProduct } from './products'
import { buildStoreProductLink } from './affiliate'
import { catalogueAvailabilityFor } from './commerce/catalogue-presentation'
import { productForSize } from './commerce/size-selection'
import { CATEGORIES } from './categories'

export const SITE_URL = 'https://theliftinglab.co.uk'
/** Absolute URL for crawlers/agents: relative paths are resolved against SITE_URL; absolute http(s) URLs pass through. */
export function absoluteUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (/^https?:\/\//i.test(path)) return path
  if (path.startsWith('//')) return `https:${path}`
  return `${SITE_URL}${path.startsWith('/') ? '' : '/'}${path}`
}
export { PRIVATE_PATHS, AGENT_CRAWLERS, noIndexDeployment } from './seo-crawlers'
export function pageMetadata(path: string, title: string, description: string, image?: string | null): Metadata {
  const url = `${SITE_URL}${path}`
  return { title, description, alternates: { canonical: url },
    openGraph: { title, description, url, type: 'website', siteName: 'The Lifting Lab', ...(image ? { images: [image] } : {}) },
    twitter: { card: 'summary_large_image', title, description, ...(image ? { images: [image] } : {}) } }
}
export function breadcrumb(items: { name: string; item: string }[]) {
  return { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, ...item })) }
}
export const siteJsonLd = {
  '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${SITE_URL}/#organization`, name: 'The Lifting Lab', url: SITE_URL, sameAs: ['https://shop.theliftinglab.co.uk'] },
    { '@type': 'WebSite', '@id': `${SITE_URL}/#website`, name: 'The Lifting Lab', url: SITE_URL, inLanguage: 'en-GB', publisher: { '@id': `${SITE_URL}/#organization` } },
  ],
}
/** Validate length and GS1 check digit; never manufacture a barcode. */
export function validGtin(value: unknown): string | null {
  if (typeof value !== 'string' || !/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(value)) return null
  const digits = value.slice(0, -1).split('').reverse()
  const sum = digits.reduce((total, digit, i) => total + Number(digit) * (i % 2 === 0 ? 3 : 1), 0)
  return (10 - sum % 10) % 10 === Number(value.at(-1)) ? value : null
}
/** Explicit allowlist: neither raw mappings nor legacy retail prices enter these outputs.
 * SKU/barcode come only from the public Shopify Storefront observation, never supplier rows. */
export function publicVariants(product: ScoredProduct, now = Date.now()) {
  const detail = { ...product, nutrients: product.nutrients ?? [] }
  const sizes = product.sizeOptions ?? []
  // Match the visible picker: multiple exact sizes own the offer; a sole size can have flavours.
  const choices = sizes.length > 1 || (sizes.length && !product.storeVariants?.length) ? sizes.map(size => {
    const selected = productForSize(detail, size)
    const variant = product.storeVariants?.find(v => v.mapping === selected.storeLinkMapping)
    return { title: size.label, flavour: variant?.flavour ?? null, size: size.label, query: `?size=${encodeURIComponent(size.slug)}`, mapping: selected.storeLinkMapping, storePrice: selected.storePrice }
  }) : product.storeVariants?.length ? product.storeVariants.map(v => ({
    title: v.label, flavour: v.flavour, size: v.packLabel, query: `?variant=${encodeURIComponent(v.variantId)}`,
    mapping: v.mapping, storePrice: v.storePrice,
  })) : [{ title: product.name, flavour: null, size: null, query: '', mapping: product.storeLinkMapping, storePrice: product.storePrice }]
  return choices.map(v => {
    const link = !product.cataloguePresentation ? buildStoreProductLink(product.id, v.mapping, now, { mode: 'product_page' }) : null
    const stock = catalogueAvailabilityFor({ id: product.id, storePrice: v.storePrice }, now)
    const approved = !!link && v.storePrice?.productId === product.id && (stock === 'available' || stock === 'out_of_stock')
    return { title: v.title, flavour: v.flavour, size: v.size, sku: approved ? v.storePrice?.sku ?? null : null, gtin: approved ? validGtin(v.storePrice?.barcode) : null,
      url: `${SITE_URL}/products/${encodeURIComponent(product.id)}${v.query}`,
      price: approved ? v.storePrice!.price : null, priceCurrency: 'GBP',
      availability: approved ? stock === 'available' ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' : null,
      store_url: link ? (() => { const url = new URL(link); for (const key of [...url.searchParams.keys()]) if (key !== 'variant') url.searchParams.delete(key); return url.toString() })() : null }
  })
}
export function productJsonLd(product: ScoredProduct, now = Date.now()) {
  const variants = publicVariants(product, now)
  const base = { name: product.name, brand: { '@type': 'Brand', name: product.brand }, url: `${SITE_URL}/products/${encodeURIComponent(product.id)}`, ...(product.image_url ? { image: absoluteUrl(product.image_url) } : {}) }
  const nodes = variants.map(v => ({ '@type': 'Product', ...base, name: variants.length > 1 ? `${product.name} · ${v.title}` : product.name, url: v.url,
    ...(v.sku ? { sku: v.sku } : {}), ...(v.gtin ? { gtin: v.gtin } : {}),
    ...(v.flavour ? { additionalProperty: { '@type': 'PropertyValue', name: 'flavour', value: v.flavour } } : {}), ...(v.size ? { size: v.size } : {}),
    ...(v.price !== null ? { offers: { '@type': 'Offer', priceCurrency: 'GBP', price: v.price, availability: v.availability, url: v.store_url,
      seller: { '@type': 'Organization', name: 'The Lifting Lab' },
      shippingDetails: { '@type': 'OfferShippingDetails', shippingRate: { '@type': 'MonetaryAmount', value: 4.99, currency: 'GBP' }, shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'GB' } },
      hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', '@id': `${SITE_URL}/refunds`, merchantReturnLink: `${SITE_URL}/refunds` },
    } } : {}) }))
  return variants.length > 1 ? { '@context': 'https://schema.org', '@type': 'ProductGroup', ...base, productGroupID: product.id,
    variesBy: [...(variants.some(v => v.flavour) ? [{ '@type': 'PropertyValue', name: 'flavour', value: [...new Set(variants.flatMap(v => v.flavour ? [v.flavour] : []))] }] : []), ...(variants.some(v => v.size) ? ['https://schema.org/size'] : [])], hasVariant: nodes }
    : { '@context': 'https://schema.org', ...nodes[0] }
}
export function productsFeed(products: ScoredProduct[], now = Date.now()) {
  return products.map(p => ({ title: p.name, brand: p.brand, url: `${SITE_URL}/products/${encodeURIComponent(p.id)}`, image: absoluteUrl(p.image_url),
    variants: publicVariants(p, now), nutrition_per_serving: (p.nutrients ?? []).map(n => ({ nutrient_name: n.nutrient_name, amount: n.amount, unit: n.unit })),
    serving_size: p.serving_size, serving_unit: p.serving_unit }))
}
export function llmsText(products: ScoredProduct[], full = false, now = Date.now()) {
  const lines = ['# The Lifting Lab', '', '> UK supplement research and comparison catalogue, with a separate Shopify store.', '',
    '## How comparisons work', 'Compare stored product labels, nutrients and listed prices. True Cost divides a known price by known servings. Formulations and serving sizes differ. Effectiveness recommendations remain unavailable pending scientific review. My Stack is a manual research tool.',
    'Only approved current store observations are labelled with price and stock below. Missing price or availability means unavailable; historical listed prices are not confirmed offers.', '',
    '## Categories', ...CATEGORIES.map(c => `- [${c.label}](${SITE_URL}/best/${c.slug})`), '', '## Key pages',
    ...['products', 'brand', 'compare', 'vs', 'brands-vs', 'ingredients-vs', 'best', 'cheapest', 'methodology', 'stack'].map(p => `- [${p}](${SITE_URL}/${p})`),
    `- [Machine-readable product feed](${SITE_URL}/feed/products.json)`, `- [Full catalogue](${SITE_URL}/llms-full.txt)`, '',
    '## Policies', 'The Lifting Lab store charges £4.99 Standard DPD Next Day delivery per UK order, free on orders of £100+. Seller: The Lifting Lab.',
    ...['delivery', 'refunds', 'privacy', 'terms', 'affiliate-disclosure'].map(p => `- [${p}](${SITE_URL}/${p})`), '- [Store](https://shop.theliftinglab.co.uk)', '', '## Products']
  for (const p of productsFeed(products, now)) {
    lines.push(`- ${p.brand}: ${p.title} — ${p.url}`)
    if (full) for (const v of p.variants) lines.push(`  - ${v.title}: ${v.price === null ? 'price unavailable' : `GBP ${v.price.toFixed(2)}`} | ${v.availability?.split('/').at(-1) ?? 'availability unavailable'} | ${v.url}`)
  }
  return lines.join('\n') + '\n'
}
