import { notFound } from 'next/navigation'
import { isSyntheticPreview } from '@/lib/preview-mode'
import PreviewUnavailableContent from '@/components/PreviewUnavailableContent'

export default function PreviewPage() {
  if (!isSyntheticPreview()) notFound()
  return <PreviewUnavailableContent />
}
