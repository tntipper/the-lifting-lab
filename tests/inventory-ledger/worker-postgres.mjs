/** End-to-end worker + actual local PG transaction protocol; Shopify transport is synthetic. */
import { spawn, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createInventoryLedgerRepository, enqueuePreparedInventoryOperation, runInventoryOperation } from '../../lib/commerce/inventory-ledger.ts'
import { fixture } from './fixture.mjs'
const container = process.env.TLL_INVENTORY_TEST_CONTAINER
assert.ok(container === 'tll-stage0-postgres' || /^tll-inventory-ci-[1-9][0-9]*$/.test(container ?? ''))
const baseArgs = ['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'tll_inventory_ledger', '-v', 'ON_ERROR_STOP=1']
const admin = sql => execFileSync('docker', baseArgs, { input: sql, encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }).trim()
assert.equal(admin("select current_database()||':'||marker from public.tll_inventory_test_marker;"),'tll_inventory_ledger:synthetic-inventory-ledger-v1')
const quote = value => value === null ? 'null' : "'" + String(value).replaceAll("'", "''") + "'"
function pool({ loseAttemptCommit = false } = {}) {
  return { connect: async () => {
    const process = spawn('docker', baseArgs, { stdio: ['pipe','pipe','pipe'] })
    process.stderr.resume() // Synthetic server diagnostics are never echoed as application errors.
    const lines = createInterface({ input: process.stdout })
    let pending = null, attempt = false
    lines.on('line', line => {
      if (!pending) return
      if (line === pending.marker) { const done = pending; pending = null; done.resolve({ rows: done.rows.map(result => ({ result: JSON.parse(result) })) }) }
      else pending.rows.push(line)
    })
    const fail = () => { pending?.reject(new Error('Local SQL connection ended')); pending = null }
    process.on('error', fail); process.on('exit', fail)
    const query = async (sql, parameters = []) => {
      assert.equal(pending, null, 'Exclusive fixture connection required')
      const marker = randomUUID()
      const response = new Promise((resolve, reject) => { pending = { marker, resolve, reject, rows: [] } })
      // This test-only bridge binds literals for fixed repository SQL. It is not a runtime driver.
      const statement = sql.replace(/\$(\d+)/g, (_, index) => quote(parameters[Number(index)-1]))
      if (sql.includes('begin_attempt')) attempt = true
      process.stdin.write(statement + ';\n\\echo '+marker+'\n')
      const result = await response
      if (sql === 'COMMIT' && attempt && loseAttemptCommit) throw new Error('Synthetic lost commit response after actual commit')
      return result
    }
    await query('SET SESSION AUTHORIZATION tll_inventory_test_worker_a')
    return { query, release: () => { process.stdin.end(); lines.close() } }
  } }
}
const workerId = '72000000-0000-4000-8000-000000000010'
const worker = (f,repository,extra={}) => runInventoryOperation({ operationId:f.plan.operationId,workerId,repository,adapter:f.adapter,issuedPlan:f.plan,enabled:true,...extra })
const durable = f => JSON.parse(admin(`select tll_inventory_private.inspect_operation(${quote(f.plan.operationId)});`))
let checks=0
const check = name => { checks++; console.log('PASS '+name) }
let repository = createInventoryLedgerRepository(pool())
let f = await fixture({operationId:randomUUID(),target:20})
assert.equal((await enqueuePreparedInventoryOperation(repository,f.adapter,f.plan)).status,'enqueued')
assert.equal((await worker(f,repository)).status,'completed')
assert.equal(durable(f).state,'completed'); assert.equal(f.calls.filter(x=>x==='TllInventorySet').length,1)
check('actual repository COMMIT and worker acknowledgement/read complete durably')
f=await fixture({operationId:randomUUID(),target:21,mutationFailure:true})
await enqueuePreparedInventoryOperation(repository,f.adapter,f.plan)
assert.equal((await worker(f,repository)).status,'held'); assert.equal(durable(f).state,'held')
assert.equal(f.calls.filter(x=>x==='TllInventorySet').length,1)
check('actual repository retains lost Shopify response as held without retry')
f=await fixture({operationId:randomUUID(),target:22})
repository=createInventoryLedgerRepository(pool({loseAttemptCommit:true}))
await enqueuePreparedInventoryOperation(repository,f.adapter,f.plan)
assert.equal((await worker(f,repository)).code,'ATTEMPT_NOT_CONFIRMED')
assert.equal(durable(f).state,'attempted'); assert.equal(f.calls.includes('TllInventorySet'),false)
admin(`update tll_inventory_private.operations set lease_until=clock_timestamp()-interval '1 second' where operation_id=${quote(f.plan.operationId)};`)
repository=createInventoryLedgerRepository(pool())
assert.equal((await worker(f,repository,{issuedPlan:undefined})).status,'held')
assert.equal(durable(f).state,'held'); assert.equal(f.calls.includes('TllInventorySet'),false)
check('lost real COMMIT acknowledgement never sends; restart reads and holds attempted marker')
console.log(`PASS ${checks} actual PostgreSQL worker flows; no external transport`)
