// Client-side stack (localStorage). Mirrors Path A behaviour — no auth required.
// Signed-in users additionally sync to Supabase via /api/stack.

export type LocalStackProduct = {
  id: string
  name: string
  brand: string
  category: string
  score: number | null
}

const KEY = 'tll_stack_v1'

function read(): LocalStackProduct[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function write(items: LocalStackProduct[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify(items))
}

export function getStack(): LocalStackProduct[] {
  return read()
}

export function inStack(productId: string): boolean {
  return read().some((p) => p.id === productId)
}

export function addToStack(product: LocalStackProduct): LocalStackProduct[] {
  const items = read()
  if (items.some((p) => p.id === product.id)) return items
  const next = [...items, product]
  write(next)
  return next
}

export function removeFromStack(productId: string): LocalStackProduct[] {
  const next = read().filter((p) => p.id !== productId)
  write(next)
  return next
}

export function clearStack(): void {
  write([])
}
