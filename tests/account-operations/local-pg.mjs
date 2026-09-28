import { spawn, execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'

export const C = 'tll-stage0-postgres', D = 'tll_account_operations_v1', BRIDGE = 'tll_ao1_bridge_executor'
const opts = { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, timeout: 15_000 }, clients = new Set()
export function admin(input) { try { return execFileSync('docker', ['exec', '-i', C, 'psql', '-XqAt', '-U', 'postgres', '-d', D, '-v', 'ON_ERROR_STOP=1'], { ...opts, input }).trim() } catch { throw Error('Synthetic account SQL failed') } }
export function assertFixture() { if (admin("SELECT current_database()||':'||coalesce(shobj_description(oid,'pg_database'),'') FROM pg_database WHERE datname=current_database()") !== D + ':tll-account-operations-synthetic-v1') throw Error('Wrong account-operation fixture') }
const literal = value => typeof value === 'string' ? "'" + value.replaceAll("'", "''") + "'" : value === null ? 'NULL' : Number.isFinite(value) ? String(value) : (() => { throw Error('binding') })()
class Client {
  constructor(role) {
    this.process = spawn('docker', ['exec', '-i', C, 'psql', '-XqAt', '-U', 'postgres', '-d', D, '-v', 'ON_ERROR_STOP=1'], { stdio: ['pipe', 'pipe', 'pipe'] })
    this.buffer = ''; this.pending = null; this.dead = false; clients.add(this)
    this.closed = new Promise(resolve => this.process.once('close', () => { this.dead = true; clients.delete(this); this.pending?.reject(Error('closed')); resolve() }))
    this.process.stderr.on('data', () => {})
    this.process.stdout.on('data', chunk => { this.buffer += chunk; const pending = this.pending; if (!pending) return; const index = this.buffer.indexOf(pending.marker + '\n'); if (index < 0) return
      const raw = this.buffer.slice(0, index).trim(); this.buffer = this.buffer.slice(index + pending.marker.length + 1); this.pending = null
      try { pending.resolve(raw ? { rows: JSON.parse(raw).rows } : { rows: [] }) } catch { pending.reject(Error('bad result')) } })
    this.ready = this.query('SET ROLE ' + role)
  }
  async query(sql, values = []) { if (this.dead || this.pending) throw Error('busy'); const text = sql.replace(/\$(\d+)/g, (_, n) => literal(values[+n - 1]))
    const statement = /^SELECT /i.test(text) ? `SELECT json_build_object('rows',COALESCE(json_agg(x),'[]'::json)) FROM (${text.replace(/;$/, '')})x;` : text + ';'
    const marker = 'tll_' + randomBytes(12).toString('hex'); return new Promise((resolve, reject) => { this.pending = { marker, resolve, reject }; this.process.stdin.write(statement + '\n\\echo ' + marker + '\n') }) }
  release() { if (!this.dead && !this.released) { this.released = true; this.process.stdin.end('\\q\n') } }
}
export function pool(fault) { return { async connect() { const client = new Client(BRIDGE); await client.ready; const query = client.query.bind(client); let operation
  return { async query(sql, values) { if (values) operation = values[0]; const result = await query(sql, values); if (fault?.({ sql, operation, rows: result.rows })) throw Error('lost acknowledgement'); return result }, release: client.release.bind(client) } } } }
export async function close() { for (const client of clients) client.release(); await Promise.all([...clients].map(client => client.closed)) }
