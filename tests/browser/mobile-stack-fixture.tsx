import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import StackBuilder from '../../app/stack/StackBuilder'
import { LocalStackProvider } from '../../components/LocalStackContext'

// Render the real stack page body/provider. Only account and HTTP boundaries
// are stubbed by mobile-stack.mjs; membership, hydration and Buy are real.
createRoot(document.getElementById('fixture')!).render(
  <StrictMode><LocalStackProvider>
    <main className="mx-auto max-w-[1180px] px-5 py-8 sm:px-8 sm:py-12">
      <StackBuilder />
    </main>
  </LocalStackProvider></StrictMode>,
)
