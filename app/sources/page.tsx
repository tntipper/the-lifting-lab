import { redirect } from 'next/navigation'

// The dedicated research-sources interface is the next design slice. Until
// every external citation has been reviewed, keep the new navigation target on
// the existing ingredient research library rather than publishing prototype
// source claims.
export default function SourcesPage() {
  redirect('/ingredients')
}
