// Browser-only guest records. One key per product prevents unrelated tab adds
// overwriting a shared JSON array. Acknowledgements target immutable save tokens.
export type LocalStackProduct = { id: string; name: string; brand: string; category: string; score: number | null }
export type GuestRecord = { token: string; product: LocalStackProduct }
export interface StackStorage { readonly length: number; key(index: number): string | null; getItem(key: string): string | null; setItem(key: string, value: string): void }
export const STACK_STORAGE_PREFIX = 'tll_stack_'
const ITEMS = 'tll_stack_v2_item:'
const ACK = 'tll_stack_v2_ack:'
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function product(value: unknown): value is LocalStackProduct {
  if (!value || typeof value !== 'object') return false
  const p = value as LocalStackProduct
  return typeof p.id === 'string' && uuid.test(p.id) && ['name', 'brand', 'category'].every(k => typeof p[k as keyof LocalStackProduct] === 'string') && (p.score === null || (typeof p.score === 'number' && Number.isFinite(p.score)))
}
export function createGuestStore(storage: StackStorage, nonce: () => string) {
  function read(): GuestRecord[] {
    const records = new Map<string, GuestRecord>()
    // Keep the old value for recovery; stable tokens make legacy acknowledgements
    // durable without a destructive migration or resurrection on the next visit.
    try {
      const legacy: unknown = JSON.parse(storage.getItem('tll_stack_v1') || '[]')
      if (Array.isArray(legacy)) for (const p of legacy) if (product(p)) {
        const id = p.id.toLowerCase()
        records.set(id, { token: `legacy:${id}`, product: { ...p, id } })
      }
    } catch { /* malformed legacy JSON is retained, never uploaded */ }
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key?.startsWith(ITEMS)) continue
      try {
        const record = JSON.parse(storage.getItem(key) || 'null') as GuestRecord
        if (record && product(record.product) && typeof record.token === 'string' && uuid.test(record.token) && key === ITEMS + record.product.id.toLowerCase()) records.set(record.product.id.toLowerCase(), record)
      } catch { /* leave unrecognised entries untouched */ }
    }
    return [...records.values()].filter(record => storage.getItem(ACK + record.token) !== '1')
  }
  function acknowledge(records: GuestRecord[]) {
    // Never delete the product key: another tab may have replaced it with a new
    // token after the request started. Acking the old token leaves that save intact.
    for (const record of records) storage.setItem(ACK + record.token, '1')
  }
  return {
    read,
    add(p: LocalStackProduct) {
      if (!product(p)) throw new Error('This product cannot be saved.')
      const id = p.id.toLowerCase(), records = read()
      if (records.some(r => r.product.id === id)) return
      if (records.length >= 100) throw new Error('Keep up to 100 products in your browser stack.')
      storage.setItem(ITEMS + id, JSON.stringify({ token: nonce(), product: { ...p, id } }))
    },
    acknowledge,
    remove(id: string) { acknowledge(read().filter(r => r.product.id === id)) },
    clear() { acknowledge(read()) },
  }
}
