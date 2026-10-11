/** Docker-loopback wire boundary; actual native runtime and verifier above this driver are unchanged. */
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { executeSql, trace } from './owner-successor-default-http.mjs'
function role(config) {
  assert.equal(config.host, 'aws-0-eu-west-2.pooler.supabase.com'); assert.equal(config.port, 6543)
  assert.equal(config.ssl.rejectUnauthorized, true)
  assert.match(config.user, /^tll_(customer|cart|broker|provisional|bridge)_runtime\.qdmvngjwkcsilzmqksme$/)
  return config.user.split('.')[0]
}
export class Client extends EventEmitter {
  constructor(config) { super(); this.config = config; this.role = role(config) }
  async connect() { executeSql('SELECT 1', this.role, this.config.password); trace(`pg_authenticated:${this.role}`) }
  async end() {}
}
export class Pool extends EventEmitter {
  constructor(config) { super(); this.config = config; this.role = role(config); this.closed = false }
  async connect() {
    assert.equal(this.closed, false); executeSql('SELECT 1', this.role, this.config.password); trace(`pg_authenticated:${this.role}`)
    const client = new EventEmitter()
    client.getTransactionStatus = () => 'I'; client.release = () => {}
    client.query = async (sql, values) => {
      assert.ok(values === undefined || Array.isArray(values))
      trace(`pg_query:${this.role}`)
      const statement = sql.replace(/\$(\d+)/g, (_, ordinal) => {
        const value = values?.[Number(ordinal) - 1]; assert.equal(typeof value, 'string'); return `'${value.replaceAll("'", "''")}'`
      }).replace(/;\s*$/, '')
      const result = executeSql(`SET application_name='Supavisor'; SELECT coalesce(json_agg(row_to_json(q)),'[]'::json) FROM (${statement})q`, this.role, this.config.password)
      return { rows: JSON.parse(result) }
    }
    return client
  }
  async end() { this.closed = true }
}
