// One creation only in the approved existing local container. No resets/logins.
import { execFileSync } from 'node:child_process'
import { assertLocalContainer, CONTAINER, DATABASE } from './local-pg.mjs'
import { source, mappings, body } from './sources.mjs'
if (process.argv.slice(2).join(' ') !== '--create-once') throw Error('Explicit --create-once required')
assertLocalContainer()
const run = (args, input) => execFileSync('docker', args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1024 * 1024 })
const sql = (database, input) => run(['exec', '-i', CONTAINER, 'psql', '-XqAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], input)
if (sql('postgres', `SELECT count(*) FROM pg_database WHERE datname='${DATABASE}'`).trim() !== '0') throw Error('Existing database refused')
const roles = ['tll_admission_bridge_migrator', ...Object.values(mappings)]
if (sql('postgres', `SELECT count(*) FROM pg_roles WHERE rolname IN (${roles.map(r => `'${r}'`).join(',')})`).trim() !== '0') throw Error('Existing fixture role refused')
const sources = [source(0), source(1), source(2)]
run(['exec', CONTAINER, 'createdb', '-U', 'postgres', DATABASE])
try {
  sql(DATABASE, `BEGIN;
COMMENT ON DATABASE ${DATABASE} IS 'tll-admission-bridge-synthetic-v1';
CREATE ROLE tll_admission_bridge_migrator NOLOGIN CREATEROLE;
GRANT CREATE ON DATABASE ${DATABASE} TO tll_admission_bridge_migrator;
CREATE SCHEMA auth AUTHORIZATION tll_admission_bridge_migrator;
SET SESSION AUTHORIZATION tll_admission_bridge_migrator;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users SELECT ('a0000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid FROM generate_series(1,20)i;
${sources.map(s => body(s.adapted)).join('\n')}
COMMIT;`)
} catch { throw Error('Dedicated fixture installation failed; database retained, no reset attempted') }
console.log('PASS: dedicated disabled bridge database created with source-verified role-only mapping', sources.map(s => ({ source: s.name, sha256: s.sha256 })))
