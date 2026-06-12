import type { Metadata } from 'next'
import Link from 'next/link'
import TopNav from '@/components/TopNav'

export const metadata: Metadata = {
  title: 'Privacy Policy — The Lifting Lab',
  description: 'How The Lifting Lab collects, uses, and protects your personal data.',
  alternates: { canonical: 'https://theliftinglab.co.uk/privacy' },
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-[11px] uppercase tracking-[0.3em] font-bold text-lab-lime mb-4">Legal</p>
        <h1 className="text-3xl font-black uppercase tracking-tight mb-2">Privacy Policy</h1>
        <p className="text-lab-muted text-sm mb-10">Last updated: June 2026</p>

        <div className="space-y-8 text-lab-muted text-sm leading-relaxed">
          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Who we are</h2>
            <p>
              The Lifting Lab (<strong className="text-white">theliftinglab.co.uk</strong>) is operated by Tobias Tipper, trading as The Lifting Lab. We are based in Scotland, UK. You can contact us at{' '}
              <a href="mailto:hello@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                hello@theliftinglab.co.uk
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">What data we collect</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong className="text-white">Email address</strong> — collected when you sign in via magic link. Used solely to authenticate your account.</li>
              <li><strong className="text-white">Usage data</strong> — pages visited, features used, collected via Google Analytics 4 (GA4). This data is anonymised and aggregated.</li>
              <li><strong className="text-white">Stack and favourites data</strong> — products you save or add to your stack, stored in our database linked to your account.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Why we collect it</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>To provide and improve the service (account features, stack builder, favourites)</li>
              <li>To understand how the site is used and improve the product (analytics)</li>
              <li>We do not sell your data to third parties</li>
              <li>We do not use your data for advertising profiling</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Legal basis</h2>
            <p>
              We process your email address on the basis of <strong className="text-white">contract</strong> (to provide the service you signed up for). We process analytics data on the basis of <strong className="text-white">legitimate interests</strong> in understanding site usage. GA4 is configured without advertising features.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">How long we keep it</h2>
            <p>
              Your account and associated data is retained for as long as your account is active. If you request deletion, we will remove your account and associated data within 30 days. Analytics data is retained by Google for 14 months.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Third-party services</h2>
            <ul className="list-disc list-inside space-y-2">
              <li><strong className="text-white">Supabase</strong> — our authentication and database provider. Your email is stored on Supabase infrastructure. See <a href="https://supabase.com/privacy" className="text-lab-lime hover:underline" target="_blank" rel="noopener noreferrer">Supabase Privacy Policy</a>.</li>
              <li><strong className="text-white">Google Analytics 4</strong> — anonymous usage analytics. See <a href="https://policies.google.com/privacy" className="text-lab-lime hover:underline" target="_blank" rel="noopener noreferrer">Google Privacy Policy</a>.</li>
              <li><strong className="text-white">Amazon Associates</strong> — we may earn a commission from qualifying purchases via Amazon links. See our <Link href="/affiliate-disclosure" className="text-lab-lime hover:underline">Affiliate Disclosure</Link>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Your rights</h2>
            <p className="mb-3">Under UK GDPR you have the right to:</p>
            <ul className="list-disc list-inside space-y-2">
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing</li>
              <li>Lodge a complaint with the ICO (<a href="https://ico.org.uk" className="text-lab-lime hover:underline" target="_blank" rel="noopener noreferrer">ico.org.uk</a>)</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, email{' '}
              <a href="mailto:hello@theliftinglab.co.uk" className="text-lab-lime hover:underline">
                hello@theliftinglab.co.uk
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-white font-bold uppercase tracking-wide mb-3">Cookies</h2>
            <p>
              We use a session cookie for authentication (essential, no consent required) and Google Analytics cookies for anonymous usage tracking. We do not use advertising or tracking cookies.
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-lab-border">
          <Link href="/" className="text-xs uppercase tracking-widest font-bold text-lab-muted hover:text-white">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  )
}
