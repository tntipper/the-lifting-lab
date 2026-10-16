import { createSharedStackHandler } from '@/lib/commerce/stack-share'

// TODO(Toby/Lifty, T05): bind the approved server product loader by exact Shopify
// variant ID, returning public product/mapping/stock fields only. Historical CSVs
// and raw private mapping rows must not be used. No live transport is bound here.
export const GET = createSharedStackHandler()
