import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { syncSession } from '@/lib/account'
import TopNav from '@/components/TopNav'
import SettingsForm from './SettingsForm'
import AccountNavigation from '@/components/AccountNavigation'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const profile = await syncSession(supabase, user)
  const unifiedCustomer = process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
    && process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER === 'enabled'

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav signedInInitial />
      <div className="max-w-2xl mx-auto px-5 py-8">
        <AccountNavigation />
        <h1 className="text-2xl font-black uppercase tracking-wide my-6">Profile &amp; security</h1>
        <SettingsForm
          email={user.email ?? ''}
          username={profile?.username ?? ''}
          displayName={profile?.display_name ?? ''}
          unifiedCustomer={unifiedCustomer}
        />
      </div>
    </div>
  )
}
