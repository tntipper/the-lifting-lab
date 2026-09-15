import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import TopNav from '../../components/TopNav'
import StackFAB from '../../components/StackFAB'
import MethodologyModal from '../../components/MethodologyModal'
import ShareModal from '../../components/ShareModal'
import WizardPage from '../../app/wizard/page'
import { LocalStackProvider, useLocalStack } from '../../components/LocalStackContext'

const product = {
  id: '20000000-0000-4000-8000-000000000001',
  name: 'Synthetic product with a long readable formula and flavour name',
  brand: 'Fixture', category: 'whey', score: null,
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
  <StrictMode><LocalStackProvider>{window.location.pathname === '/wizard' ? <WizardPage /> : <Controls />}</LocalStackProvider></StrictMode>,
)
