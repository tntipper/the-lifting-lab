'use client'

import { createContext, useContext } from 'react'
import type { StagingCartView } from '@/lib/commerce/staging-cart-types'

export type CartContext = {
  enabled: boolean; view: StagingCartView | null; busy: boolean; notice: string
  open(): void; close(): void; refresh(): Promise<void>; setQuantity(quantity: number, productId?: string): Promise<void>
}
export const StagingCartContext = createContext<CartContext | null>(null)
export const useStagingCart = () => useContext(StagingCartContext)
