'use client'

import { useLocalStack } from './LocalStackContext'
import { useShopPanels } from './ShopPanelsContext'

/** Compatibility trigger for consumers outside the root layout. */
export default function StackFAB() {
  const { stack } = useLocalStack()
  const { openStack, panel } = useShopPanels()
  return <button type="button" className="shop-stack-trigger" onClick={openStack} aria-label="My Stack" aria-haspopup="dialog" aria-expanded={panel === 'stack'}>My stack <span className="shop-mono">{stack.length}</span></button>
}
