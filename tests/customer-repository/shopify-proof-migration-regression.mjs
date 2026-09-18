// Rollback-only reconstruction of additive migration 012 in the marked fixture.
import assert from 'node:assert/strict'
import {createHash} from 'node:crypto'
import {readFileSync} from 'node:fs'
import {admin,assertFixture} from './local-pg.mjs'

assertFixture()
const exclusive=`DO $$BEGIN IF EXISTS(SELECT FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()) THEN RAISE EXCEPTION 'Fixture is not exclusive'; END IF; END$$;`
admin(exclusive)
assert.equal(admin('SELECT enabled FROM tll_customer_private.control'),'f')
const fingerprint=()=>createHash('sha256').update(admin(`SELECT jsonb_build_object(
 'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY oid) FROM pg_roles r),
 'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY oid) FROM pg_auth_members m),
 'namespace',(SELECT to_jsonb(n) FROM pg_namespace n WHERE nspname='tll_customer_private'),
 'relations',(SELECT jsonb_agg(to_jsonb(c)-ARRAY['relpages','reltuples','relallvisible','relfrozenxid','relminmxid'] ORDER BY oid) FROM pg_class c WHERE relnamespace='tll_customer_private'::regnamespace),
 'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY attrelid,attnum) FROM pg_attribute a WHERE attrelid IN (SELECT oid FROM pg_class WHERE relnamespace='tll_customer_private'::regnamespace)),
 'functions',(SELECT jsonb_agg(to_jsonb(p) ORDER BY oid) FROM pg_proc p WHERE pronamespace='tll_customer_private'::regnamespace),
 'data',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY transaction_id),'[]') FROM tll_customer_private.shopify_proofs x))`)).digest('hex')
const before=fingerprint(),sql=readFileSync(new URL('../../supabase/migrations/202609180012_customer_shopify_proof_repository.sql',import.meta.url),'utf8')
assert.ok(sql.includes('\nBEGIN;\n')&&sql.endsWith('COMMIT;\n'))
const body=sql.slice(sql.indexOf('BEGIN;\n')+7,-8)
admin(`BEGIN; ${exclusive}
 DROP FUNCTION tll_customer_private.shopify_proof_repository(text,jsonb);
 DROP TABLE tll_customer_private.shopify_proofs; DROP SEQUENCE tll_customer_private.shopify_proof_fences;
 SET SESSION AUTHORIZATION tll_customer_migrator;
 ${body}
 DO $$BEGIN
   IF to_regclass('tll_customer_private.shopify_proofs') IS NULL
     OR to_regprocedure('tll_customer_private.shopify_proof_repository(text,jsonb)') IS NULL
     OR tll_customer_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Additive reconstruction failed'; END IF;
 END$$;
 ROLLBACK;`)
assert.equal(fingerprint(),before)
assert.equal(admin("SELECT count(*) FROM pg_roles WHERE rolname IN ('tll_customer_default_probe','tll_customer_role_setup')"),'0')
console.log(`PASS: additive Shopify proof migration reconstructed under the existing non-superuser operator and rolled back to exact catalog/data fingerprint ${before}`)
