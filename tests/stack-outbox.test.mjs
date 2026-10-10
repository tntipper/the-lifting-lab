import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createGuestStore } from '../lib/local-stack.ts'
import { createAdditionOutbox, ADDITION_OUTBOX_PREFIX } from '../lib/stack-addition-outbox.ts'
import { createStackSync } from '../lib/stack-sync.ts'

const A = '70000000-0000-4000-8000-000000000001', B = '70000000-0000-4000-8000-000000000002'
const P = '71000000-0000-4000-8000-000000000001', Q = '71000000-0000-4000-8000-000000000002'
const product = id => ({ id, name: 'Synthetic', brand: 'Fixture', category: 'creatine', score: null })
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
function storage() {
  const map = new Map()
  return { map, get length() { return map.size }, key: i => [...map.keys()][i] ?? null,
    getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}
function fixture(data = storage()) {
  const states = new Map(), receipts = new Map(), calls = [], additions = createAdditionOutbox(data)
  let owner = A, fail = false, lost = false, mutations = 0
  const snapshot = () => {
    const items = states.get(owner) ?? []
    return { userId: owner, stackId: null, revision: mutations, recoveryConflicts: 0,
      items: items.map(id => ({ id, product_id: id, servings_per_day: 1, products: product(id) })) }
  }
  const request = async (_url, options) => {
    if (!options.method) return json(snapshot())
    const { productId } = JSON.parse(options.body), key = options.headers['Idempotency-Key']
    calls.push({ owner, key, body: options.body, expected: options.headers['X-Stack-Expected-User'] })
    // Assert write-ahead durability at the moment of every attempt.
    assert.ok(additions.read(options.headers['X-Stack-Expected-User']).some(r => r.requestId === key && r.productId === productId))
    if (fail) throw new Error('Offline')
    if (owner !== options.headers['X-Stack-Expected-User']) return json({ error: 'Account changed' }, 409)
    const receipt = owner + key, duplicate = receipts.has(receipt)
    if (!duplicate) {
      states.set(owner, [...new Set([...(states.get(owner) ?? []), productId])]); mutations++
      receipts.set(receipt, options.body)
    } else assert.equal(receipts.get(receipt), options.body)
    if (lost) { lost = false; throw new Error('Server committed; response was lost') }
    return json({ status: 'applied', duplicate, snapshot: snapshot(), acceptedIds: [productId], rejectedIds: [] })
  }
  const create = (override = request, nonce = randomUUID) => createStackSync({ guest: createGuestStore(data, randomUUID), additions, nonce, request: override, changed() {} })
  return { data, additions, states, calls, create, request, get mutations() { return mutations },
    set owner(value) { owner = value }, set fail(value) { fail = value }, set lost(value) { lost = value } }
}

test('network failure then reload replays the durable exact payload/key without minting another nonce', async () => {
  const f = fixture(), first = f.create()
  await first.setIdentity(A); f.fail = true; await first.add(product(P))
  assert.match(first.getState().error, /kept in this browser for this account/)
  assert.equal(f.additions.read(A).length, 1); first.dispose()
  f.fail = false
  const second = f.create(undefined, () => { throw new Error('Reload must not mint a nonce') })
  await second.setIdentity(A)
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].key, f.calls[1].key); assert.equal(f.calls[0].body, f.calls[1].body)
  assert.deepEqual(second.getState().snapshot.items.map(i => i.product_id), [P])
  assert.equal(f.additions.read(A).length, 0); assert.equal(f.mutations, 1)
})

test('lost success then later removal is acknowledged from the duplicate receipt without resurrection', async () => {
  const f = fixture(), first = f.create()
  await first.setIdentity(A); f.lost = true; await first.add(product(P)); first.dispose()
  assert.equal(f.mutations, 1)
  f.states.set(A, []) // A later device intentionally removed the accepted item.
  const reload = f.create(); await reload.setIdentity(A)
  assert.equal(f.calls[0].key, f.calls[1].key); assert.equal(f.mutations, 1)
  assert.deepEqual(reload.getState().snapshot.items, []); assert.equal(f.additions.read(A).length, 0)
})

test('account switch leaves Alice additions isolated while Bob saves his own product, then Alice resumes', async () => {
  const f = fixture(), service = f.create(); await service.setIdentity(A)
  f.fail = true; await service.add(product(P)); f.fail = false
  await service.setIdentity(null); f.owner = B; await service.setIdentity(B)
  assert.equal(f.calls.length, 1); assert.equal(service.getState().guest.length, 0)
  await service.add(product(Q)); assert.deepEqual(f.states.get(B), [Q]); assert.equal(f.additions.read(A).length, 1)
  f.owner = A; await service.setIdentity(A)
  assert.deepEqual(f.states.get(A), [P]); assert.equal(f.additions.read(A).length, 0)
  assert.equal(f.calls[0].key, f.calls[2].key)
  assert.ok(f.calls.every(call => call.owner === call.expected))
})

test('cookie switch before the client auth event cannot retarget a queued addition', async () => {
  const f = fixture(), service = f.create(); await service.setIdentity(A)
  f.owner = B; await service.add(product(P))
  assert.equal(f.mutations, 0); assert.equal(f.calls[0].expected, A)
  assert.equal(f.additions.read(A).length, 1); assert.equal(f.additions.read(B).length, 0)
  await service.setIdentity(B); assert.equal(f.calls.length, 1)
  f.owner = A; await service.setIdentity(A); assert.deepEqual(f.states.get(A), [P]); assert.equal(f.states.has(B), false)
})

test('two tabs replaying one pending request use the same receipt and acknowledge only that request', async () => {
  const f = fixture(); f.additions.add(A, P, randomUUID())
  let release; const barrier = new Promise(resolve => { release = resolve }); let arrivals = 0
  const request = async (...args) => {
    if (args[1].method) { if (++arrivals === 2) release(); await barrier }
    return f.request(...args)
  }
  const one = f.create(request), two = f.create(request)
  await Promise.all([one.setIdentity(A), two.setIdentity(A)])
  assert.equal(f.calls.length, 2); assert.equal(f.calls[0].key, f.calls[1].key); assert.equal(f.mutations, 1)
  assert.equal(f.additions.read(A).length, 0)
  assert.ok([one, two].every(service => service.getState().snapshot.items.length === 1))
})

test('independent tab records and later same-product additions cannot be erased by an old acknowledgement', () => {
  const data = storage(), one = createAdditionOutbox(data), two = createAdditionOutbox(data)
  const old = one.add(A, P, randomUUID()), later = two.add(A, P, randomUUID()), other = two.add(A, Q, randomUUID())
  one.acknowledge(old)
  assert.deepEqual(new Set(one.read(A).map(r => r.requestId)), new Set([later.requestId, other.requestId]))
  one.acknowledge(old); assert.equal(two.read(A).length, 2)
})

for (const kind of ['throw-write', 'ignore-write', 'throw-read']) test(`unavailable storage (${kind}) sends no authenticated addition`, async () => {
  const data = storage(), f = fixture(data), service = f.create(); await service.setIdentity(A)
  if (kind === 'throw-write') data.setItem = () => { throw new Error('Quota') }
  if (kind === 'ignore-write') data.setItem = () => {}
  if (kind === 'throw-read') data.key = () => { throw new Error('Unavailable') }
  if (kind === 'throw-read') data.map.set(ADDITION_OUTBOX_PREFIX + A + ':placeholder', '{}')
  await service.add(product(P))
  assert.equal(f.calls.length, 0); assert.match(service.getState().error, /No new addition was sent/)
})

test('failed acknowledgement remains retryable with the same key and causes no duplicate insertion', async () => {
  const data = storage(), f = fixture(data), service = f.create(); await service.setIdentity(A)
  const remove = data.removeItem; data.removeItem = () => { throw new Error('Storage unavailable') }
  await service.add(product(P)); assert.equal(service.getState().retryable, true); assert.equal(f.additions.read(A).length, 1)
  data.removeItem = remove; await service.retry()
  assert.equal(f.calls[0].key, f.calls[1].key); assert.equal(f.mutations, 1); assert.equal(f.additions.read(A).length, 0)
})

test('unavailable product is terminally acknowledged, with an honest rejection instead of endless retries', async () => {
  const f = fixture(), service = f.create(async (url, options) => options.method
    ? json({ status: 'applied', snapshot: { userId: A, revision: 0, items: [] }, acceptedIds: [], rejectedIds: [P] })
    : f.request(url, options))
  await service.setIdentity(A); await service.add(product(P))
  assert.equal(f.additions.read(A).length, 0); assert.equal(service.getState().retryable, false)
  assert.match(service.getState().error, /unavailable and has not been added/)
})

for (const reply of [{ acceptedIds: [], rejectedIds: [] }, { acceptedIds: [Q], rejectedIds: [] }, { acceptedIds: [P], rejectedIds: [] }]) {
  test(`invalid addition acknowledgement retains the exact pending request: ${JSON.stringify(reply)}`, async () => {
    const f = fixture(), service = f.create(async (url, options) => options.method
      ? json({ status: 'applied', snapshot: { userId: A, revision: 0, items: [] }, ...reply }) : f.request(url, options))
    await service.setIdentity(A); await service.add(product(P))
    assert.equal(f.additions.read(A).length, 1); assert.equal(service.getState().retryable, true)
  })
}

test('corrupt own-account records stay untouched and are never sent or migrated into another account', async () => {
  const f = fixture(), key = ADDITION_OUTBOX_PREFIX + A + ':' + randomUUID()
  f.data.setItem(key, '{'); const service = f.create(); await service.setIdentity(A)
  assert.equal(f.calls.length, 0); assert.match(service.getState().error, /could not be stored or read/)
  f.owner = B; await service.setIdentity(B); await service.add(product(Q))
  assert.deepEqual(f.states.get(B), [Q]); assert.equal(f.data.getItem(key), '{')
})

test('another tab pending addition blocks destructive writes until its original operation is confirmed', async () => {
  const f = fixture(), service = f.create(); await service.setIdentity(A)
  f.additions.add(A, P, randomUUID()); await service.clear()
  assert.equal(f.calls.length, 0); assert.match(service.getState().error, /pending additions/)
  await service.retry(); assert.equal(f.mutations, 1); assert.equal(f.additions.read(A).length, 0)
})

test('disposing an in-flight tab does not acknowledge its addition; a reload can still confirm it', async () => {
  const f = fixture(); let release
  const held = new Promise(resolve => { release = resolve })
  const service = f.create(async (...args) => { const result = await f.request(...args); if (args[1].method) await held; return result })
  await service.setIdentity(A); const adding = service.add(product(P)); await new Promise(setImmediate)
  service.dispose(); release(); await adding
  assert.equal(f.additions.read(A).length, 1)
  const reload = f.create(); await reload.setIdentity(A)
  assert.equal(f.mutations, 1); assert.equal(f.additions.read(A).length, 0)
})
