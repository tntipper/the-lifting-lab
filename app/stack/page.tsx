import { isSyntheticPreview } from '@/lib/preview-mode'
import StackBuilder from './StackBuilder'
import TopNav from '@/components/TopNav'

export default function StackPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-[#14140f]">
      <TopNav />
      <main className="mx-auto max-w-[1200px] px-4 py-8 sm:py-12">
        {isSyntheticPreview() && <div className="mb-6 rounded-lg border border-[#ccd0c4] bg-white px-4 py-3 text-sm text-[#62645c]">
          Local design preview: your stack is stored only in this browser. Accounts and purchases remain disabled.
        </div>}
        <StackBuilder />
        <p className="mt-8 border-t border-lab-border pt-5 text-xs text-lab-muted">For informational purposes only. Not medical advice.</p>
      </main>
    </div>
  )
}
