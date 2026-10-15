'use client'

import { createContext, useContext } from 'react'
import type { ScoredProduct } from '@/lib/products'
import { useStagingCart } from './StagingCartContext'

export type BasketLine = { product: ScoredProduct; quantity: number }
export type PanelsContext = {
  panel: 'basket' | 'stack' | null
  openBasket(): void; openStack(): void; closePanel(): void
  basket: BasketLine[]; addToBasket(product: ScoredProduct): void; setBasketQuantity(id: string, quantity: number): void
  compared: ScoredProduct[]; toggleCompare(product: ScoredProduct): void; removeCompare(id: string): void; clearCompare(): void
}
export const ShopPanelsContext = createContext<PanelsContext>({ panel: null, basket: [], compared: [], openBasket() {}, openStack() {}, closePanel() {}, addToBasket() {}, setBasketQuantity() {}, toggleCompare() {}, removeCompare() {}, clearCompare() {} })
export function useShopPanels() {
  const value = useContext(ShopPanelsContext)
  return value
}
export const panelMoney = (value: number | null | undefined) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? `£${value.toFixed(2)}` : 'Not listed'

export function BasketAddButton({ product }: { product: ScoredProduct }) {
  const { addToBasket } = useShopPanels()
  const cart = useStagingCart()
  if (cart?.enabled) return null // Existing StagingCartAdd owns the synthetic API action.
  return <button type="button" className="shop-secondary" onClick={() => addToBasket(product)}>Add to basket</button>
}
