import StagingCustomerSignInEntry from '@/components/StagingCustomerSignInEntry'
import { stagingCustomerUiEnabled } from '@/lib/identity/staging-customer-ui'
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

/**
 * Bare `/auth/customer` is the Preview Sign In entry when staging customer is
 * enabled. Nested prepare/start/authorize handlers remain route-only.
 */
export default function StagingCustomerSignInPage() {
  if (!stagingCustomerUiEnabled()) redirect('/auth')
  return <StagingCustomerSignInEntry />
}
