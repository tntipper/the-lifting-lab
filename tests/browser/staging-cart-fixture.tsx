import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import TopNav from '../../components/TopNav'
import StagingCartProvider from '../../components/StagingCartProvider'
import { StagingCartContents } from '../../components/StagingCartPanel'
import ProductOfferLink from '../../components/ProductOfferLink'
import { StagingCartAdd } from '../../components/StagingCartActions'

const product = { id: '40000000-0000-4000-8000-000000000001', brand: 'Synthetic', name: 'Synthetic staging research product with a deliberately long formula flavour and pack description', buy_url: null }
function Fixture() {
  return <StagingCartProvider><TopNav /><main className="mx-auto max-w-4xl p-4 space-y-6 text-white">
    <h1 className="break-words">{window.location.pathname === '/cart' ? 'Test cart page' : product.name}</h1>
    {window.location.pathname === '/cart' ? <StagingCartContents /> : <>
      <section aria-label="Product purchase actions" className="max-w-sm rounded-lg border border-lab-border p-4">
        <ProductOfferLink product={product} />
      </section>
      <section aria-label="Manual stack purchase action" className="max-w-sm rounded-lg border border-lab-border p-4">
        <h2>Manual stack record</h2><StagingCartAdd productId={product.id} />
      </section>
      <section aria-label="Unmapped product"><ProductOfferLink product={{ ...product, id: '40000000-0000-4000-8000-000000000002' }} /></section>
    </>}
  </main></StagingCartProvider>
}
const root = createRoot(document.getElementById('fixture')!)
Object.assign(window, { __unmountCart: () => root.unmount() })
root.render(<StrictMode><Fixture /></StrictMode>)
