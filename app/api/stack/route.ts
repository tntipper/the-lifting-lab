import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { awardPoints } from '@/lib/points';
import { parseStackOperation, readStackBody } from '@/lib/stack-api';
export const dynamic = 'force-dynamic';
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { 'Cache-Control': 'private, no-store' } });
// A read never creates a stack, including on first use or a provider failure.
export async function GET() {
    try {
        const supabase = await createServerSupabase();
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (!user)
            return json({ error: authError ? 'Sign in again to load your stack.' : 'Unauthorized' }, 401);
        const { data, error } = await supabase.rpc('get_active_stack');
        if (error || !data || data.userId !== user.id)
            return json({ error: 'Your saved stack could not be loaded. Please try again.' }, 503);
        return json(data);
    }
    catch {
        return json({ error: 'Your saved stack could not be loaded. Please try again.' }, 503);
    }
}
async function mutate(request: Request) {
    try {
        const supabase = await createServerSupabase();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user)
            return json({ error: 'Unauthorized' }, 401);
        const parsed = await readStackBody(request);
        if (parsed.status)
            return json({ error: parsed.status === 413 ? 'This stack request is too large.' : 'Invalid stack request.' }, parsed.status);
        const operation = parseStackOperation(request.method, parsed.body, request.headers.get('idempotency-key'));
        if (!operation)
            return json({ error: 'Invalid stack request. Refresh your stack and try again.' }, 400);
        const { data, error } = await supabase.rpc('mutate_active_stack', {
            p_operation: operation.operation, p_product_ids: operation.productIds, p_request_id: operation.requestId,
            p_expected_revision: operation.expectedRevision, p_servings: operation.servings,
        });
        if (error || !data)
            return json({ error: 'Your change could not be saved. Please retry.' }, 503);
        if (data.snapshot && data.snapshot.userId !== user.id)
            return json({ error: 'Your change could not be confirmed. Please retry.' }, 503);
        if (data.status === 'conflict')
            return json({ error: 'Your stack changed elsewhere. Review the latest stack before retrying.', snapshot: data.snapshot }, 409);
        if (data.status === 'idempotency_conflict')
            return json({ error: 'This retry does not match the original change. Refresh your stack.' }, 409);
        if (data.status === 'invalid')
            return json({ error: 'Invalid stack request.' }, 400);
        if (data.status === 'not_found')
            return json({ error: 'This item is no longer in your stack.', snapshot: data.snapshot }, 404);
        if (data.status !== 'applied' || data.snapshot?.userId !== user.id)
            return json({ error: 'Your change could not be confirmed. Please retry.' }, 503);
        let pointsAwarded = 0;
        if (['add', 'merge'].includes(operation.operation) && data.snapshot?.stackId && data.snapshot.items?.length >= 3)
            pointsAwarded = await awardPoints(supabase, 'build_stack', data.snapshot.stackId);
        return json({ ...data, ok: true, pointsAwarded });
    }
    catch {
        return json({ error: 'Your change could not be saved. Please retry.' }, 503);
    }
}
export const POST = mutate;
export const DELETE = mutate;
export const PATCH = mutate;
