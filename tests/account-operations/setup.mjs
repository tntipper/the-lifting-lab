import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const C = 'tll-stage0-postgres', D = 'tll_account_operations_v1', M = 'tll_account_migrator_v1'
const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 })
const sql = (db, input) => run(['exec', '-i', C, 'psql', '-XqAt', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1'], input)
if (process.argv.slice(2).join(' ') !== '--create-once') throw Error('Explicit --create-once required')
if (process.env.DOCKER_HOST && !process.env.DOCKER_HOST.startsWith('unix://')) throw Error('Remote Docker refused')
if (!run(['context', 'inspect', '--format', '{{(index .Endpoints "docker").Host}}']).trim().startsWith('unix://')) throw Error('Local Docker required')
if (!/^true postgres:17/.test(run(['inspect', '--format', '{{.State.Running}} {{.Config.Image}}', C]).trim())) throw Error('Exact local PG17 container required')
if (sql('postgres', `SELECT count(*) FROM pg_database WHERE datname='${D}'`).trim() !== '0') throw Error('Existing account-operation fixture refused')
const map = {
  tll_customer_owner: 'tll_ao1_customer_owner', tll_customer_executor: 'tll_ao1_customer_executor', tll_customer_role_setup: 'tll_ao1_customer_role_setup',
  tll_broker_owner: 'tll_ao1_broker_owner', tll_broker_executor: 'tll_ao1_broker_executor', tll_broker_role_setup: 'tll_ao1_broker_role_setup',
  tll_provisional_owner: 'tll_ao1_provisional_owner', tll_provisional_executor: 'tll_ao1_provisional_executor', tll_provisional_role_setup: 'tll_ao1_provisional_role_setup',
  tll_bridge_owner: 'tll_ao1_bridge_owner', tll_bridge_executor: 'tll_ao1_bridge_executor',
}
const roles = [M, ...Object.values(map)]
if (sql('postgres', `SELECT count(*) FROM pg_roles WHERE rolname IN (${roles.map(x => `'${x}'`).join(',')})`).trim() !== '0') throw Error('Existing fixture roles refused')
const names = ['202609150005_customer_connection_repository.sql', '202609150007_customer_subject_broker_repository.sql',
  '202609170008_customer_provisional_admission_repository.sql', '202609170010_customer_admission_bridge.sql',
  '202609170011_customer_browser_admission_once.sql', '202609180012_customer_shopify_proof_repository.sql',
  '202609180013_customer_final_reconciliation.sql', '202609180015_customer_account_operations.sql']
const adapt = text => { for (const [a, b] of Object.entries(map)) text = text.replace(new RegExp(`(?<![A-Za-z0-9_$])${a}(?![A-Za-z0-9_$])`, 'g'), b); return text }
const body = text => { if (!text.startsWith('--') || !text.includes('BEGIN;') || !text.endsWith('COMMIT;\n')) throw Error('Migration shape'); return text.slice(text.indexOf('BEGIN;') + 6).replace(/COMMIT;\n$/, '') }
const sources = names.map(name => { const original = readFileSync(new URL('../../supabase/migrations/' + name, import.meta.url), 'utf8'); return { name, sha: createHash('sha256').update(original).digest('hex'), text: adapt(original) } })
run(['exec', C, 'createdb', '-U', 'postgres', D])
try {
  sql(D, `BEGIN; COMMENT ON DATABASE ${D} IS 'tll-account-operations-synthetic-v1'; CREATE ROLE ${M} NOLOGIN CREATEROLE;
    GRANT CREATE ON DATABASE ${D} TO ${M}; CREATE SCHEMA auth AUTHORIZATION ${M}; SET SESSION AUTHORIZATION ${M};
    CREATE TABLE auth.users(id uuid PRIMARY KEY); INSERT INTO auth.users SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,20)i;
    ${sources.map(x => body(x.text)).join('\n')} COMMIT;`)
} catch { throw Error('Account-operation fixture installation failed; database retained for inspection') }
console.log(JSON.stringify({ status: 'PASS', database: D, sources: sources.map(({ name, sha }) => ({ name, sha })) }))
