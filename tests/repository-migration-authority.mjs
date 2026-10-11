// Fixed local-fixture SQL, used only inside the caller's rollback transaction.
export function migrationAuthorityProof(name) {
  if (!['customer','broker','provisional'].includes(name)) throw new Error('Unexpected repository fixture')
  const owner=`tll_${name}_owner`,executor=`tll_${name}_executor`,operator=`tll_${name}_migrator`,schema=`tll_${name}_private`
  return `
DO $authority_before$ BEGIN
  IF (SELECT count(*) FROM pg_auth_members WHERE roleid='${owner}'::regrole AND member=current_user::regrole AND grantor='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)<>1
    OR (SELECT count(*) FROM pg_auth_members WHERE roleid='${owner}'::regrole)<>1 THEN RAISE EXCEPTION 'Expected one bootstrap ADMIN-only owner edge'; END IF;
  BEGIN ALTER FUNCTION ${schema}.operator_status() COST 101; RAISE EXCEPTION 'Default operator can alter function'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN ALTER TABLE ${schema}.control ADD COLUMN upgrade_probe boolean; RAISE EXCEPTION 'Default operator can alter table'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  -- PostgreSQL may warn and grant nothing when the operator can SELECT but
  -- has no grant option. Prove the outcome instead of requiring an exception.
  BEGIN GRANT SELECT ON ${schema}.control TO ${executor}; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF has_table_privilege('${executor}','${schema}.control','SELECT')
    OR EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a WHERE c.oid='${schema}.control'::regclass AND a.grantee='${executor}'::regrole) THEN RAISE EXCEPTION 'Default operator can grant data'; END IF;
END $authority_before$;
GRANT ${owner} TO ${operator} WITH ADMIN FALSE, INHERIT FALSE, SET TRUE;
DO $authority_temporary$ BEGIN
  IF (SELECT count(*) FROM pg_auth_members WHERE roleid='${owner}'::regrole AND member=current_user::regrole)<>2
    OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid='${owner}'::regrole AND member=current_user::regrole AND grantor=current_user::regrole AND NOT admin_option AND NOT inherit_option AND set_option)
    OR pg_has_role(current_user,'${owner}','USAGE') THEN RAISE EXCEPTION 'Temporary SET-only self edge mismatch'; END IF;
END $authority_temporary$;
SET LOCAL ROLE ${owner};
ALTER FUNCTION ${schema}.operator_status() COST 101;
DO $replace_function$ BEGIN EXECUTE pg_get_functiondef('${schema}.operator_status()'::regprocedure); END $replace_function$;
ALTER TABLE ${schema}.control ADD COLUMN upgrade_probe boolean;
GRANT SELECT ON ${schema}.control TO ${executor};
DO $authority_ddl$ BEGIN
  IF (SELECT procost FROM pg_proc WHERE oid='${schema}.operator_status()'::regprocedure)<>101
    OR NOT EXISTS(SELECT FROM pg_attribute WHERE attrelid='${schema}.control'::regclass AND attname='upgrade_probe' AND NOT attisdropped)
    OR NOT has_table_privilege('${executor}','${schema}.control','SELECT') THEN RAISE EXCEPTION 'Reviewed future migration failed'; END IF;
END $authority_ddl$;
REVOKE SELECT ON ${schema}.control FROM ${executor};
ALTER TABLE ${schema}.control DROP COLUMN upgrade_probe;
ALTER FUNCTION ${schema}.operator_status() COST 100;
RESET ROLE;
REVOKE ${owner} FROM ${operator} GRANTED BY ${operator};
DO $authority_after$ BEGIN
  IF (SELECT count(*) FROM pg_auth_members WHERE roleid='${owner}'::regrole)<>1
    OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid='${owner}'::regrole AND member=current_user::regrole AND grantor='postgres'::regrole AND admin_option AND NOT inherit_option AND NOT set_option)
    OR pg_has_role(current_user,'${owner}','USAGE') OR pg_has_role(current_user,'${owner}','SET')
    OR (has_table_privilege(current_user,'${schema}.control','SELECT') IS DISTINCT FROM pg_has_role(current_user,'pg_read_all_data','USAGE')) OR has_table_privilege('${executor}','${schema}.control','SELECT') THEN RAISE EXCEPTION 'Future migration authority not retired'; END IF;
  BEGIN ALTER FUNCTION ${schema}.operator_status() COST 101; RAISE EXCEPTION 'Retired operator can alter function'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $authority_after$;
`
}
