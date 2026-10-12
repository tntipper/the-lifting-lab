import { createServerSupabase } from '@/lib/supabase-server'
import { createManualAdminHandler } from '@/lib/commerce/harness/manual-admin-http'

export const dynamic = 'force-dynamic'
const handler = createManualAdminHandler({
  enabled: process.env.HARNESS_MANUAL_QUEUE_ENABLED,
  async authenticate() {
    // No admin permission helper exists in this checkout. Reuse the existing session helper.
    // TODO(Toby/Lifty): bind a reviewed server-owned admin permission check; never user_metadata/email matching.
    // Default OFF avoids even an authentication service read until separately approved wiring.
    if (process.env.HARNESS_MANUAL_QUEUE_ENABLED !== 'true') return null
    const client = await createServerSupabase()
    const { data, error } = await client.auth.getUser()
    if (error || !data.user) return null
    return { id: data.user.id, admin: false }
  },
  // TODO: inject restricted createManualQueueStore client after approved static migration application.
})
export const GET = handler
export const POST = handler
