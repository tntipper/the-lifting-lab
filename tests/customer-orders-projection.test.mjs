import test from 'node:test'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundle = await build({
  stdin: {
    contents: "export * from './lib/identity/customer-orders-projection.ts'",
    resolveDir: process.cwd(),
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  write: false,
  logLevel: 'silent',
})
const { parseCustomerOrdersProjection } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64')
)

const valid = (change = {}) => ({
  orders: [{
    reference: '#1001',
    createdAt: '2026-09-18T10:00:00Z',
    financialStatus: 'PAID',
    fulfillmentStatus: 'UNFULFILLED',
    totalPence: 2450,
    currency: 'GBP',
    items: [{ name: 'Synthetic whey', quantity: 2 }],
    hasMoreItems: false,
    ...change,
  }],
  hasMoreOrders: false,
})

test('allowlisted projection parses for the account orders UI', () => {
  const parsed = parseCustomerOrdersProjection(valid())
  assert.deepEqual(parsed, valid())
})

test('empty orders list is valid', () => {
  assert.deepEqual(parseCustomerOrdersProjection({ orders: [], hasMoreOrders: false }), {
    orders: [],
    hasMoreOrders: false,
  })
})

test('rejects email, token, extra fields, unsafe money and unknown statuses', () => {
  const cases = [
    { ...valid(), email: 'customer@example.com' },
    { orders: [{ ...valid().orders[0], accessToken: 'secret' }], hasMoreOrders: false },
    { orders: [{ ...valid().orders[0], currency: 'USD' }], hasMoreOrders: false },
    { orders: [{ ...valid().orders[0], financialStatus: 'HACKED' }], hasMoreOrders: false },
    { orders: [{ ...valid().orders[0], totalPence: 24.5 }], hasMoreOrders: false },
    { orders: [{ ...valid().orders[0], items: Array(11).fill({ name: 'x', quantity: 1 }) }], hasMoreOrders: false },
    { orders: Array(11).fill(valid().orders[0]), hasMoreOrders: false },
  ]
  for (const value of cases) assert.equal(parseCustomerOrdersProjection(value), null)
})
