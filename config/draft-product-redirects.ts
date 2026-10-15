import products from './draft-product-redirects.data.json'

/** Local draft only: Shopify-domain redirects require a separately approved CSV import. */
export function draftProductRedirects(env: NodeJS.ProcessEnv = process.env) {
  return env.TLL_DRAFT_REDIRECTS === '1' ? products.map(product => ({
    source: `/products/${product.handle}`,
    destination: `/best/${product.category}`,
    permanent: true,
  })) : []
}
