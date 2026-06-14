import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import { syncSession } from '@/lib/account'
import TopNav from '@/components/TopNav'
import SettingsForm from './SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')

  const profile = await syncSession(supabase, user)

  return (
    <div className="min-h-screen bg-lab-bg text-white">
      <TopNav />
      <div className="max-w-2xl mx-auto px-5 py-8">
        <h1 className="text-2xl font-black uppercase tracking-wide mb-6">Account Settings</h1>
        <SettingsForm
          email={user.email ?? ''}
          username={profile?.username ?? ''}
          displayName={profile?.display_name ?? ''}
        />
      </div>
    </div>
  )
}
