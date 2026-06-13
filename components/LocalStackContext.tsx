'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import {
  getStack,
  addToStack,
  removeFromStack,
  inStack,
  clearStack,
  type LocalStackProduct,
} from '@/lib/local-stack'

type LocalStackCtx = {
  stack: LocalStackProduct[]
  inStack: (id: string) => boolean
  toggle: (product: LocalStackProduct) => void
  clear: () => void
}

const Ctx = createContext<LocalStackCtx>({
  stack: [],
  inStack: () => false,
  toggle: () => {},
  clear: () => {},
})

export function LocalStackProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<LocalStackProduct[]>([])

  // hydrate from localStorage after mount (avoids SSR mismatch)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setStack(getStack()) }, [])

  const toggle = useCallback((product: LocalStackProduct) => {
    if (inStack(product.id)) {
      setStack(removeFromStack(product.id))
    } else {
      setStack(addToStack(product))
    }
  }, [])

  const clear = useCallback(() => {
    clearStack()
    setStack([])
  }, [])

  const isIn = useCallback((id: string) => stack.some((p) => p.id === id), [stack])

  return (
    <Ctx.Provider value={{ stack, inStack: isIn, toggle, clear }}>
      {children}
    </Ctx.Provider>
  )
}

export function useLocalStack() {
  return useContext(Ctx)
}
