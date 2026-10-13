/** Toby-approved pack/data duplicate redirects; Next permanent redirects use HTTP 308. */
export const PRODUCT_SIZE_REDIRECTS = [
  { source: '/products/8ddfc493-0872-4235-ba25-5091ef172b49', destination: '/products/1fab2546-6a25-4fd9-8e49-abf6bb6b362c?size=single-bar', permanent: true },
  { source: '/products/b9058eef-f71a-49f7-9672-a264d1a09614', destination: '/products/e94b13c4-f7fa-42d2-94b2-8dfcda316311?size=16-servings', permanent: true },
  { source: '/products/60cbe489-96a8-416e-a11b-243e3277caf3', destination: '/products/2567a955-be92-4f70-b147-f908fa80650c', permanent: true },
] as const

export function isRedirectedProduct(id: string): boolean {
  return PRODUCT_SIZE_REDIRECTS.some(redirect => redirect.source === `/products/${id}`)
}
