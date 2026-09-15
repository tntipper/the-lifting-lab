import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import TopNav from '../../components/TopNav'
import StackFAB from '../../components/StackFAB'
import MethodologyModal from '../../components/MethodologyModal'
import ShareModal from '../../components/ShareModal'
import WizardPage from '../../app/wizard/page'
import ProductOfferLink from '../../components/ProductOfferLink'
import { LocalStackProvider, useLocalStack } from '../../components/LocalStackContext'

const product = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Synthetic product with a long readable formula and flavour name',
  brand: 'Fixture', category: 'whey', score: null,
}

const offerCases = [
  { state: 'listing', buy_url: 'https://www.amazon.co.uk/dp/B000000001?th=1' },
  { state: 'search', buy_url: 'https://www.bulk.com/uk/search?q=synthetic-fixture' },
  { state: 'missing', buy_url: null },
  { state: 'own-shop', buy_url: 'https://shop.theliftinglab.co.uk/products/synthetic-fixture?variant=12345' },
]

function OfferControls() {
  return <main className="min-h-screen bg-lab-bg p-4 space-y-6 text-white">
    <h1>Isolated product listing acceptance</h1>
    {(['card', 'sticky'] as const).map(layout => (
      <section key={layout} aria-label={`${layout} offer actions`} className="space-y-4">
        <h2>{layout === 'card' ? 'Three-column product card actions' : 'Three-column sticky-bar-style actions'}</h2>
        {offerCases.map(item => (
          <div key={item.state} data-offer-layout={layout} data-offer-case={item.state}
            className={layout === 'card' ? 'max-w-sm rounded-xl border border-lab-border bg-lab-panel p-4' : 'max-w-6xl border-y border-lab-border bg-lab-panel-2 px-4 py-3'}>
            <h3 className="mb-3 break-words text-sm">Synthetic {item.state} reference</h3>
            <div className="grid grid-cols-3 gap-2" data-offer-grid>
              <button type="button" className="min-h-11 min-w-0 rounded-lg border border-lab-border text-[10px]">Stack fixture</button>
              <button type="button" className="min-h-11 min-w-0 rounded-lg border border-lab-border text-[10px]">Compare fixture</button>
              <ProductOfferLink product={{ brand: product.brand, name: product.name, buy_url: item.buy_url }}
                className="rounded-lg bg-lab-lime py-2.5 text-[10px] font-black uppercase tracking-widest text-black" />
            </div>
          </div>
        ))}
      </section>
    ))}
    <button type="button" data-offer-end>End of offer actions</button>
  </main>
}

function Controls() {
  const { toggle } = useLocalStack()
  const [share, setShare] = useState(false)
  return <>
    <TopNav />
    <main className="p-4 space-y-6">
      <h1>Isolated navigation and dialog acceptance</h1>
      <MethodologyModal category="whey" />
      <button type="button" onClick={() => toggle(product)}>Add synthetic product</button>
      <button type="button" onClick={() => setShare(true)}>Open share fixture</button>
      <ShareModal open={share} onClose={() => setShare(false)} productId={product.id}
        productName={product.name} brand={product.brand} score={null} />
    </main>
    <footer><a href="#footer">Footer end</a></footer>
    <StackFAB />
  </>
}

createRoot(document.getElementById('fixture')!).render(
  <StrictMode><LocalStackProvider>{window.location.pathname === '/wizard' ? <WizardPage /> : window.location.pathname === '/offers' ? <OfferControls /> : <Controls />}</LocalStackProvider></StrictMode>,
)
