/** Legacy listed pack prices are display estimates, never approved checkout costs. */
export function listedPackPence(price: unknown): number | null {
  if (typeof price !== 'number' || !Number.isFinite(price) || price <= 0) return null
  const pence = Math.round(price * 100)
  return Number.isSafeInteger(pence) && pence / 100 === price ? pence : null
}

export function listedPackSubtotal(products: ReadonlyArray<{ retail_price?: unknown } | null | undefined>): number | null {
  let total = 0
  for (const product of products) {
    const price = listedPackPence(product?.retail_price)
    if (price === null || !Number.isSafeInteger(total + price)) return null
    total += price
  }
  return total
}
