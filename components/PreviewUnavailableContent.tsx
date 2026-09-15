import Link from 'next/link'
import TopNav from '@/components/TopNav'

export default function PreviewUnavailableContent() {
  return (
    <>
      <TopNav />
      <main className="mx-auto w-full max-w-2xl px-6 py-12 text-white">
        <h1 className="text-3xl font-bold">Visual preview</h1>
        <p className="mt-4 text-lab-muted">Live data, sign-in, account changes, submissions and purchases are disabled in this preview. No email will be sent and no customer record will be changed.</p>
        <p className="mt-4 text-lab-muted">You can review page layouts and browse the static information. An empty product list here does not describe the live catalogue.</p>
        <Link href="/" className="mt-6 inline-block rounded-lg bg-lab-lime px-5 py-3 font-bold text-black">Return to the preview home page</Link>
      </main>
    </>
  )
}
