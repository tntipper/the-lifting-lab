import assert from 'node:assert/strict'

const A = '70000000-0000-4000-8000-000000000001', B = '70000000-0000-4000-8000-000000000002'
const P = '20000000-0000-4000-8000-000000000001', prefix = 'tll_stack_v3_add:'
const ready = page => page.locator('[data-ready]').filter({ hasText: 'Ready' }).waitFor()
const pending = page => page.evaluate(start => Object.keys(localStorage).filter(key => key.startsWith(start)).map(key => JSON.parse(localStorage.getItem(key))), prefix)

// Actual provider, browser localStorage, reload and auth subscription; only the
// remote /api/stack boundary is replaced with a synthetic receipt-aware server.
export async function verifyStackOutbox(page, origin) {
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  let owner = A, mode = 'offline', inserts = 0
  let onAttempt = null
  const records = new Map(), receipts = new Map(), attempts = []
  const snapshot = () => ({ userId: owner, stackId: null, revision: inserts, recoveryConflicts: 0,
    items: [...(records.get(owner) ?? [])].map(id => ({ id, product_id: id, servings_per_day: 1, products: { id, name: 'Synthetic', brand: 'Fixture', category: 'creatine' } })) })
  const handler = async route => {
    const request = route.request()
    if (request.method() === 'GET') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(snapshot()) })
    assert.equal(request.method(), 'POST')
    const requestId = request.headers()['idempotency-key'], expected = request.headers()['x-stack-expected-user']
    attempts.push({ requestId, expected, owner, body: request.postData() })
    assert.deepEqual(request.postDataJSON(), { productId: P })
    assert.ok((await pending(request.frame().page())).some(record => record.requestId === requestId && record.ownerId === expected))
    if (onAttempt) await onAttempt()
    if (owner !== expected) return route.fulfill({ status: 409, contentType: 'application/json', body: '{}' })
    if (mode === 'offline') return route.abort('failed')
    const key = owner + requestId, duplicate = receipts.has(key)
    if (!duplicate) { records.set(owner, new Set([...(records.get(owner) ?? []), P])); receipts.set(key, request.postData()); inserts++ }
    else assert.equal(receipts.get(key), request.postData())
    if (mode === 'lost-response') { mode = 'online'; return route.abort('failed') }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'applied', duplicate, snapshot: snapshot(), acceptedIds: [P], rejectedIds: [] }) })
  }
  await page.route('**/api/stack', handler)
  try {
    await page.goto(origin + '/stack-outbox'); await ready(page)
    await page.getByRole('button', { name: 'Add synthetic account product' }).click()
    await page.getByRole('status').filter({ hasText: 'kept in this browser for this account' }).waitFor()
    assert.equal((await pending(page)).length, 1)
    const first = attempts[0]
    // Bob's auth event and reload cannot consume Alice's durable record.
    owner = B; await page.evaluate(id => window.__setFixtureUser(id), B); await ready(page)
    await page.reload(); await ready(page)
    assert.equal(attempts.length, 1); assert.equal((await pending(page))[0].ownerId, A)
    assert.equal(await page.locator('[data-members]').innerText(), '')
    // Alice resumes; first successful server commit loses its response.
    owner = A; mode = 'lost-response'; await page.evaluate(id => window.__setFixtureUser(id), A)
    await page.getByRole('status').filter({ hasText: 'kept in this browser for this account' }).waitFor()
    assert.equal(inserts, 1); assert.equal((await pending(page)).length, 1)
    await page.reload(); await ready(page)
    await page.locator('[data-members]').filter({ hasText: P }).waitFor()
    assert.equal((await pending(page)).length, 0)
    assert.equal(inserts, 1); assert.equal(attempts.length, 3)
    assert.ok(attempts.every(attempt => attempt.requestId === first.requestId && attempt.body === first.body && attempt.expected === A && attempt.owner === A))
    assert.equal(records.has(B), false)

    // Two actual tabs share localStorage and independently resume one recorded
    // addition. Hold both responses so neither can remove the record too early.
    records.clear(); receipts.clear(); attempts.length = 0; inserts = 0; mode = 'offline'
    await page.reload(); await ready(page)
    await page.getByRole('button', { name: 'Add synthetic account product' }).click()
    await page.getByRole('status').filter({ hasText: 'kept in this browser for this account' }).waitFor()
    mode = 'online'
    let arrivals = 0, arrived, release
    const both = new Promise(resolve => { arrived = resolve })
    const barrier = new Promise(resolve => { release = resolve })
    onAttempt = async () => { if (++arrivals === 2) arrived(); await barrier }
    const tab = await page.context().newPage(), errors = []
    tab.on('pageerror', error => errors.push(error.message))
    await tab.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort())
    await tab.route('**/api/stack', handler)
    let timeout
    try {
      await Promise.all([page.reload(), tab.goto(origin + '/stack-outbox')])
      await Promise.race([both, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Both browser tabs did not attempt the pending addition')), 10000) })])
      clearTimeout(timeout)
      assert.equal((await pending(page)).length, 1)
      release(); onAttempt = null
      await Promise.all([page.locator('[data-members]').filter({ hasText: P }).waitFor(), tab.locator('[data-members]').filter({ hasText: P }).waitFor()])
      await Promise.all([ready(page), ready(tab)])
      assert.equal((await pending(page)).length, 0); assert.equal(inserts, 1)
      assert.equal(attempts.length, 3) // Initial offline attempt plus two tab retries.
      assert.ok(attempts.every(attempt => attempt.requestId === attempts[0].requestId))
      assert.deepEqual(errors, [])
    } finally { clearTimeout(timeout); release(); onAttempt = null; await tab.close() }
  } finally { await page.unroute('**/api/stack', handler) }
}
