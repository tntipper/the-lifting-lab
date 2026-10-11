// Shared request boundary; the database remains the authority for ownership,
// singleton creation, idempotency and compare-and-swap revisions.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const STACK_BODY_BYTES = 8192;
export type StackOperation = {
    operation: 'add' | 'merge' | 'remove' | 'clear' | 'servings';
    productIds: string[];
    requestId: string;
    expectedRevision: number | null;
    servings: number;
};
function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every(key => allowed.includes(key)); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function revision(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function servings(value: unknown): value is number { return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10; }
export function parseStackOperation(method: string, body: unknown, requestId: string | null): StackOperation | null {
    if (!uuid(requestId) || !record(body))
        return null;
    const base = { requestId: requestId.toLowerCase(), expectedRevision: null, servings: 1 };
    if (method === 'POST' && Array.isArray(body.productIds) && body.productIds.length > 0 && body.productIds.length <= 100 && keys(body, ['productIds'])) {
        // for...of sees sparse-array holes and rejects them instead of skipping.
        for (const value of body.productIds)
            if (!uuid(value))
                return null;
        return { ...base, operation: 'merge', productIds: [...new Set((body.productIds as string[]).map(id => id.toLowerCase()))].sort() };
    }
    if (method === 'POST' && uuid(body.productId) && keys(body, ['productId', 'servingsPerDay']) && (body.servingsPerDay === undefined || servings(body.servingsPerDay)))
        return { ...base, operation: 'add', productIds: [body.productId.toLowerCase()], servings: (body.servingsPerDay as number | undefined) ?? 1 };
    if (method === 'DELETE' && revision(body.expectedRevision)) {
        if (body.clear === true && keys(body, ['clear', 'expectedRevision']))
            return { ...base, operation: 'clear', productIds: [], expectedRevision: body.expectedRevision };
        if (uuid(body.productId) && keys(body, ['productId', 'expectedRevision']))
            return { ...base, operation: 'remove', productIds: [body.productId.toLowerCase()], expectedRevision: body.expectedRevision };
    }
    if (method === 'PATCH' && uuid(body.productId) && servings(body.servingsPerDay) && revision(body.expectedRevision) && keys(body, ['productId', 'servingsPerDay', 'expectedRevision']))
        return { ...base, operation: 'servings', productIds: [body.productId.toLowerCase()], expectedRevision: body.expectedRevision, servings: body.servingsPerDay };
    return null;
}
export async function readStackBody(request: Request): Promise<{
    body: unknown;
    status?: never;
} | {
    status: 400 | 413 | 415;
    body?: never;
}> {
    if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json' || request.headers.has('content-encoding'))
        return { status: 415 };
    const reader = request.body?.getReader();
    if (!reader)
        return { status: 400 };
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            bytes += value.byteLength;
            if (bytes > STACK_BODY_BYTES) {
                await reader.cancel();
                return { status: 413 };
            }
            chunks.push(value);
        }
        const joined = new Uint8Array(bytes);
        let offset = 0;
        for (const chunk of chunks) {
            joined.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { body: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(joined)) };
    }
    catch {
        return { status: 400 };
    }
    finally {
        reader.releaseLock();
    }
}
