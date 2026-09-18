import Link from 'next/link'
import { redirect } from 'next/navigation'
import TopNav from '@/components/TopNav'
import { createServerSupabase } from '@/lib/supabase-server'
import AccountOrders from './AccountOrders'

export const dynamic = 'force-dynamic'

export default async function AccountOrdersPage() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth')
  const unifiedCustomer = process.env.NEXT_PUBLIC_TLL_ENVIRONMENT === 'staging'
    && process.env.NEXT_PUBLIC_TLL_STAGING_CUSTOMER === 'enabled'

  return <div className="min-h-screen bg-lab-bg text-white">
    <TopNav />
    <main className="max-w-3xl mx-auto px-5 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div><p className="text-[11px] font-bold uppercase tracking-widest text-lab-lime">One TLL account</p><h1 className="text-2xl font-black uppercase tracking-wide mt-1">My orders</h1></div>
        <Link href="/dashboard" className="min-h-11 inline-flex items-center text-xs font-bold uppercase tracking-widest text-lab-muted hover:text-white">Back to account</Link>
      </div>
      <AccountOrders />
      <form action={unifiedCustomer ? '/auth/customer/logout' : '/auth/signout'} method="post" className="mt-8 border-t border-lab-border pt-6">
        <button className="min-h-11 text-xs font-bold uppercase tracking-widest text-lab-muted hover:text-white">{unifiedCustomer ? 'Sign out of TLL and shop' : 'Sign out'}</button>
      </form>
    </main>
  </div>
}
