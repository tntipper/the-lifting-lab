'use client'

import { createContext, useContext, useState, useEffect, useRef, type ReactNode } from 'react'
import { createGuestStore, STACK_STORAGE_PREFIX, type LocalStackProduct } from '@/lib/local-stack'
import { createStackSync, type StackSyncState } from '@/lib/stack-sync'
import { createAdditionOutbox } from '@/lib/stack-addition-outbox'
import { createClient } from '@/lib/supabase'
import { scoreFor } from '@/lib/scores'

type LocalStackCtx = {
  stack: LocalStackProduct[]
  state: StackSyncState
  inStack(id: string): boolean
  add(product: LocalStackProduct): void
  toggle(product: LocalStackProduct): void
  remove(id: string): void
  clear(): void
  retry(): void
}
const initial: StackSyncState = { identity: undefined, snapshot: null, guest: [], loading: true, busy: false, error: null, retryable: false }
const Ctx = createContext<LocalStackCtx>({ stack: [], state: initial, inStack: () => false, add: () => {}, toggle: () => {}, remove: () => {}, clear: () => {}, retry: () => {} })

export function LocalStackProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StackSyncState>(initial)
  const sync = useRef<ReturnType<typeof createStackSync> | null>(null)
  useEffect(() => {
    const storage = {
      get length() { return window.localStorage.length },
      key: (index: number) => window.localStorage.key(index),
      getItem: (key: string) => window.localStorage.getItem(key),
      setItem: (key: string, value: string) => window.localStorage.setItem(key, value),
      removeItem: (key: string) => window.localStorage.removeItem(key),
    }
    const service = createStackSync({ guest: createGuestStore(storage, () => crypto.randomUUID()), additions: createAdditionOutbox(storage), request: (...args) => fetch(...args), nonce: () => crypto.randomUUID(), changed: setState })
    sync.current = service
    const client = createClient()
    let cancelled = false, authEvent = 0
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      authEvent++
      void service.setIdentity(session?.user.id ?? null)
    })
    const observedEvent = authEvent
    void client.auth.getUser().then(({ data, error }) => {
      if (cancelled || authEvent !== observedEvent) return
      if (error && error.name !== 'AuthSessionMissingError') service.authFailed()
      else void service.setIdentity(data.user?.id ?? null)
    }).catch(() => { if (!cancelled) service.authFailed() })
    const refresh = () => { void service.refresh() }
    let storageRefresh: ReturnType<typeof setTimeout> | undefined
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(STACK_STORAGE_PREFIX)) {
        clearTimeout(storageRefresh)
        storageRefresh = setTimeout(refresh, 150)
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('online', refresh)
    window.addEventListener('storage', onStorage)
    return () => {
      cancelled = true; clearTimeout(storageRefresh); service.dispose(); subscription.unsubscribe(); sync.current = null
      window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); window.removeEventListener('storage', onStorage)
    }
  }, [])
  const saved = (state.snapshot?.items || []).map(item => ({
    id: item.product_id,
    name: item.products?.name || 'Unavailable saved product',
    brand: item.products?.brand || '',
    category: item.products?.category || '',
    score: item.products ? scoreFor(item.products.brand, item.products.name) : null,
  }))
  const stack = [...saved, ...state.guest.map(r => r.product).filter(p => !saved.some(s => s.id === p.id))]
  return <Ctx.Provider value={{
    stack, state,
    inStack: id => stack.some(p => p.id === id),
    add: product => { void sync.current?.add(product) },
    toggle: product => { if (stack.some(p => p.id === product.id)) void sync.current?.remove(product.id); else void sync.current?.add(product) },
    remove: id => { void sync.current?.remove(id) },
    clear: () => { void sync.current?.clear() },
    retry: () => { void sync.current?.retry() },
  }}>{children}</Ctx.Provider>
}
export function useLocalStack() { return useContext(Ctx) }
