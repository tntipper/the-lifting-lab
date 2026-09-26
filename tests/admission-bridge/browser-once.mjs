// Fixed existing fixture only; role substitutions preserve every non-role byte.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { mappings, body } from './sources.mjs'
import { admin } from './local-pg.mjs'
export const NAME = '202609170011_customer_browser_admission_once.sql'
export function source() {
  const original = readFileSync(new URL('../../supabase/migrations/' + NAME, import.meta.url), 'utf8')
  const sha256 = createHash('sha256').update(original).digest('hex')
  if (sha256 !== '12bf5b5916d2f266f218bcd39c38098aea3225acef1cb0f67b47fe76bc29f58f') throw Error('Reviewed 011 source hash changed')
  let adapted = original
  for (const [canonical, local] of Object.entries(mappings)) adapted = adapted.replace(new RegExp(`(?<![A-Za-z0-9_$])${canonical}(?![A-Za-z0-9_$])`, 'g'), local)
  let restored = adapted
  for (const [canonical, local] of Object.entries(mappings)) restored = restored.replace(new RegExp(`(?<![A-Za-z0-9_$])${local}(?![A-Za-z0-9_$])`, 'g'), canonical)
  if (restored !== original) throw Error('Fixture changed non-role source bytes')
  return { original, adapted, body: body(adapted), sha256 }
}
export const exclusive = `DO $$BEGIN IF EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'Fixture is not exclusive'; END IF; END$$;`
export const fingerprint = () => admin(`SELECT json_build_object(
 'roles',(SELECT json_agg(x ORDER BY oid) FROM (SELECT * FROM pg_roles WHERE rolname LIKE 'tll_ab_%' OR rolname='tll_admission_bridge_migrator')x),
 'membership',(SELECT json_agg(x ORDER BY oid) FROM pg_auth_members x),
 'namespace',(SELECT json_agg(x ORDER BY oid) FROM pg_namespace x WHERE nspname IN ('tll_bridge_private','tll_broker_private','tll_provisional_private')),
 'functions',(SELECT json_agg(x ORDER BY oid) FROM pg_proc x WHERE pronamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace)),
 'relations',(SELECT json_agg(x ORDER BY oid) FROM pg_class x WHERE relnamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace)),
 'columns',(SELECT json_agg(x ORDER BY attrelid,attnum) FROM pg_attribute x WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace))),
 'constraints',(SELECT json_agg(x ORDER BY oid) FROM pg_constraint x WHERE connamespace IN ('tll_bridge_private'::regnamespace,'tll_broker_private'::regnamespace,'tll_provisional_private'::regnamespace)),
 'controls',json_build_array((SELECT row_to_json(x) FROM tll_bridge_private.control x),(SELECT row_to_json(x) FROM tll_broker_private.control x),(SELECT row_to_json(x) FROM tll_provisional_private.control x)),
 'intents',(SELECT coalesce(json_agg(x),'[]') FROM tll_provisional_private.intents x),
 'flows',(SELECT coalesce(json_agg(x),'[]') FROM tll_broker_private.flows x),
 'grants',(SELECT coalesce(json_agg(x),'[]') FROM tll_bridge_private.grants x))`)
