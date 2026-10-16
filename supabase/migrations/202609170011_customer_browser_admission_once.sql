-- LOCAL, UNAPPLIED: one durable admission attempt per sealed bootstrap binding.
-- Install after 010 with all repositories disabled. No new role, RPC or activation.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- The complete reviewed 010 security guard runs before and after this additive DDL.
DO $postflight$
DECLARE s text; r record; f record; owner_name text; role_name text; expected boolean; expected_read boolean;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Unexpected bridge activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['tll_broker_owner','tll_broker_executor','tll_provisional_owner','tll_provisional_executor','tll_bridge_owner','tll_bridge_executor'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication OR rolinherit))
     OR (SELECT count(*) FROM pg_auth_members WHERE roleid=role_name::regrole)<>1
     OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=role_name::regrole AND member=current_user::regrole
       AND admin_option AND NOT inherit_option AND NOT set_option AND (SELECT rolsuper FROM pg_roles WHERE oid=grantor))
     OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_name::regrole) THEN RAISE EXCEPTION 'Unexpected bridge role authority'; END IF;
 END LOOP;
 FOREACH s IN ARRAY ARRAY['tll_broker_private','tll_provisional_private','tll_bridge_private'] LOOP
   owner_name:=CASE s WHEN 'tll_broker_private' THEN 'tll_broker_owner' WHEN 'tll_provisional_private' THEN 'tll_provisional_owner' ELSE 'tll_bridge_owner' END;
   FOR r IN SELECT n.nspowner,x.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.oid=s::regnamespace LOOP
     IF r.nspowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private schema owner'; END IF;
     IF r.grantee=r.nspowner THEN CONTINUE; END IF;
     expected:=r.grantee=current_user::regrole
       OR r.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole
       OR (s='tll_bridge_private' AND r.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole))
       OR (s<>'tll_bridge_private' AND r.grantee='tll_bridge_owner'::regrole);
     IF NOT expected OR r.privilege_type<>'USAGE' OR r.is_grantable THEN RAISE EXCEPTION 'Unexpected private schema ACL'; END IF;
   END LOOP;
   FOR r IN SELECT c.oid,c.relkind,c.relowner,c.relrowsecurity FROM pg_class c WHERE c.relnamespace=s::regnamespace AND c.relkind IN ('r','S') LOOP
     IF r.relowner<>owner_name::regrole OR (r.relkind='r' AND NOT r.relrowsecurity) THEN RAISE EXCEPTION 'Wrong private relation ownership or RLS'; END IF;
     IF EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
       WHERE c.oid=r.oid AND x.grantee<>r.relowner)
       OR EXISTS(SELECT FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid=r.oid AND x.grantee<>r.relowner) THEN
       RAISE EXCEPTION 'Unexpected private relation or column ACL'; END IF;
   END LOOP;
   -- Every nonowner function ACL must match the narrow explicit graph below;
   -- no PUBLIC or nonowner GRANT OPTION survives default or inherited grants.
   FOR f IN SELECT p.oid,p.proname,p.proowner,x.grantee,x.privilege_type,x.is_grantable FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.pronamespace=s::regnamespace LOOP
     IF f.proowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private function owner'; END IF;
     IF f.grantee=f.proowner THEN CONTINUE; END IF;
     expected:=(f.grantee=current_user::regrole AND f.proname IN ('operator_status','operator_set_enabled'))
       OR (f.proname='repository' AND f.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole)
       OR (s='tll_bridge_private' AND f.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole) AND f.proname IN ('gate','terminal','advance_epoch'))
       OR (s='tll_bridge_private' AND f.grantee='tll_broker_owner'::regrole AND f.proname IN ('authorize','browser_admitted'))
       OR (s='tll_broker_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_register','bridge_terminal'))
       OR (s='tll_provisional_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_source','bridge_terminal','uuid_valid','hash_valid','opaque_valid','ms'));
     IF NOT expected OR f.privilege_type<>'EXECUTE' OR f.is_grantable THEN RAISE EXCEPTION 'Unexpected private function ACL'; END IF;
   END LOOP;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_broker_executor','tll_provisional_executor','tll_bridge_executor',current_user::text] LOOP
     IF (SELECT rolsuper FROM pg_roles WHERE rolname=role_name) THEN
       IF role_name=current_user::text THEN CONTINUE; END IF;
       RAISE EXCEPTION 'Unexpected protected role superuser';
     END IF;
     IF has_schema_privilege(role_name,s,'CREATE') THEN RAISE EXCEPTION 'Unexpected private schema CREATE'; END IF;
     expected:=role_name=current_user::text OR role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END);
     IF has_schema_privilege(role_name,s,'USAGE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
     -- Only the trusted installing operator may retain existing platform-wide
     -- SELECT; browser and runtime roles must have zero effective data authority.
     expected_read:=role_name=current_user::text AND pg_has_role(role_name,'pg_read_all_data','USAGE');
     FOR r IN SELECT oid,relkind FROM pg_class WHERE relnamespace=s::regnamespace AND relkind IN ('r','S') LOOP
       IF r.relkind='r' AND ((has_table_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR (has_any_column_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR has_table_privilege(role_name,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         OR has_any_column_privilege(role_name,r.oid,'INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private data access'; END IF;
       IF r.relkind='S' AND ((has_sequence_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR has_sequence_privilege(role_name,r.oid,'USAGE,UPDATE')) THEN RAISE EXCEPTION 'Unexpected effective sequence access'; END IF;
     END LOOP;
     FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace=s::regnamespace LOOP
       expected:=(role_name=current_user::text AND f.proname IN ('operator_status','operator_set_enabled'))
         OR (role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END) AND f.proname='repository');
       IF has_function_privilege(role_name,f.oid,'EXECUTE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
     END LOOP;
   END LOOP;
 END LOOP;
END $postflight$;
DO $upgrade$
DECLARE r text; pin record; installer name:=current_user;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regclass('tll_provisional_private.provisional_browser_once') IS NOT NULL THEN
   RAISE EXCEPTION 'Browser binding upgrade unavailable'; END IF;
 FOR pin IN SELECT * FROM jsonb_each_text('{"tll_bridge_private.advance_epoch":"9c7070c757b45225ad7472991f3f4b1c","tll_bridge_private.authorize":"1a0b187e2d4baa4fa19cc5282f82ae56","tll_bridge_private.browser_admitted":"108c1a45510ec182be71e93d355782e3","tll_bridge_private.gate":"507ab740339ae86b72918cf43596472b","tll_bridge_private.operator_set_enabled":"eafc2ca9c9312c1b52eca81ba0dd05ff","tll_bridge_private.operator_status":"f3daf7f5699b7e12e055a380a1de4157","tll_bridge_private.repository":"5ab7163c673663e76a6b2e071faecd8c","tll_bridge_private.terminal":"26be94ca67bcf38d9d4ba815707e407e","tll_broker_private.bridge_lock":"20ad27d7d824862ee383775f659a5330","tll_broker_private.bridge_register":"62d1ad8092befdb0d4c4e24586afddb1","tll_broker_private.bridge_terminal":"30090d51de7a26db5740eeeb5f44e947","tll_broker_private.operator_set_enabled":"842c21aba98745fa7308bd0509e56cdf","tll_broker_private.repository":"3a73033597ae0b514f29c66b6b5f6bf8","tll_broker_private.repository_v1":"5eb6b29e2416753f6d13335e504009a7","tll_provisional_private.bridge_lock":"e8202a1dcbc01211f87661b0e76e2548","tll_provisional_private.bridge_source":"63b8472f0ac4029771321debfb9dca7a","tll_provisional_private.bridge_terminal":"c3402aeaa075c957da839b82769e256a","tll_provisional_private.operator_set_enabled":"71d119961cfbfe4c5378a1cc4b3813a1","tll_provisional_private.repository":"c81cd90f775d744f0f7b0b466359a7d6","tll_provisional_private.repository_v1":"594359bf5e758ab5237d8a1d309cc175"}'::jsonb) LOOP

   IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname||'.'||p.proname=pin.key AND md5(p.prosrc)=pin.value
       AND p.prosecdef AND p.proconfig=ARRAY[CASE WHEN p.proname='repository_v1'
         THEN 'search_path=pg_catalog, '||n.nspname ELSE 'search_path=pg_catalog' END])<>1 THEN
     RAISE EXCEPTION 'Reviewed admission source required'; END IF;
 END LOOP;
 FOREACH r IN ARRAY ARRAY['tll_bridge_owner','tll_broker_owner','tll_provisional_owner'] LOOP
   EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE',r,installer);
 END LOOP;
 -- Preserve the runtime G -> B -> P order and retain every gate until COMMIT.
 PERFORM tll_bridge_private.gate();
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN
   RAISE EXCEPTION 'Disable all repositories before browser binding upgrade'; END IF;
 ALTER TABLE tll_provisional_private.intents ADD CONSTRAINT provisional_browser_once UNIQUE(browser_hash);
 FOREACH r IN ARRAY ARRAY['tll_bridge_owner','tll_broker_owner','tll_provisional_owner'] LOOP
   IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
     EXECUTE format('GRANT %I TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',r,installer);
   ELSE EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',r,installer,installer); END IF;
 END LOOP;
END $upgrade$;
DO $postflight$
DECLARE s text; r record; f record; owner_name text; role_name text; expected boolean; expected_read boolean;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Unexpected bridge activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['tll_broker_owner','tll_broker_executor','tll_provisional_owner','tll_provisional_executor','tll_bridge_owner','tll_bridge_executor'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication OR rolinherit))
     OR (SELECT count(*) FROM pg_auth_members WHERE roleid=role_name::regrole)<>1
     OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=role_name::regrole AND member=current_user::regrole
       AND admin_option AND NOT inherit_option AND NOT set_option AND (SELECT rolsuper FROM pg_roles WHERE oid=grantor))
     OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_name::regrole) THEN RAISE EXCEPTION 'Unexpected bridge role authority'; END IF;
 END LOOP;
 FOREACH s IN ARRAY ARRAY['tll_broker_private','tll_provisional_private','tll_bridge_private'] LOOP
   owner_name:=CASE s WHEN 'tll_broker_private' THEN 'tll_broker_owner' WHEN 'tll_provisional_private' THEN 'tll_provisional_owner' ELSE 'tll_bridge_owner' END;
   FOR r IN SELECT n.nspowner,x.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.oid=s::regnamespace LOOP
     IF r.nspowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private schema owner'; END IF;
     IF r.grantee=r.nspowner THEN CONTINUE; END IF;
     expected:=r.grantee=current_user::regrole
       OR r.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole
       OR (s='tll_bridge_private' AND r.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole))
       OR (s<>'tll_bridge_private' AND r.grantee='tll_bridge_owner'::regrole);
     IF NOT expected OR r.privilege_type<>'USAGE' OR r.is_grantable THEN RAISE EXCEPTION 'Unexpected private schema ACL'; END IF;
   END LOOP;
   FOR r IN SELECT c.oid,c.relkind,c.relowner,c.relrowsecurity FROM pg_class c WHERE c.relnamespace=s::regnamespace AND c.relkind IN ('r','S') LOOP
     IF r.relowner<>owner_name::regrole OR (r.relkind='r' AND NOT r.relrowsecurity) THEN RAISE EXCEPTION 'Wrong private relation ownership or RLS'; END IF;
     IF EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
       WHERE c.oid=r.oid AND x.grantee<>r.relowner)
       OR EXISTS(SELECT FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid=r.oid AND x.grantee<>r.relowner) THEN
       RAISE EXCEPTION 'Unexpected private relation or column ACL'; END IF;
   END LOOP;
   -- Every nonowner function ACL must match the narrow explicit graph below;
   -- no PUBLIC or nonowner GRANT OPTION survives default or inherited grants.
   FOR f IN SELECT p.oid,p.proname,p.proowner,x.grantee,x.privilege_type,x.is_grantable FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.pronamespace=s::regnamespace LOOP
     IF f.proowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private function owner'; END IF;
     IF f.grantee=f.proowner THEN CONTINUE; END IF;
     expected:=(f.grantee=current_user::regrole AND f.proname IN ('operator_status','operator_set_enabled'))
       OR (f.proname='repository' AND f.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole)
       OR (s='tll_bridge_private' AND f.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole) AND f.proname IN ('gate','terminal','advance_epoch'))
       OR (s='tll_bridge_private' AND f.grantee='tll_broker_owner'::regrole AND f.proname IN ('authorize','browser_admitted'))
       OR (s='tll_broker_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_register','bridge_terminal'))
       OR (s='tll_provisional_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_source','bridge_terminal','uuid_valid','hash_valid','opaque_valid','ms'));
     IF NOT expected OR f.privilege_type<>'EXECUTE' OR f.is_grantable THEN RAISE EXCEPTION 'Unexpected private function ACL'; END IF;
   END LOOP;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_broker_executor','tll_provisional_executor','tll_bridge_executor',current_user::text] LOOP
     IF (SELECT rolsuper FROM pg_roles WHERE rolname=role_name) THEN
       IF role_name=current_user::text THEN CONTINUE; END IF;
       RAISE EXCEPTION 'Unexpected protected role superuser';
     END IF;
     IF has_schema_privilege(role_name,s,'CREATE') THEN RAISE EXCEPTION 'Unexpected private schema CREATE'; END IF;
     expected:=role_name=current_user::text OR role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END);
     IF has_schema_privilege(role_name,s,'USAGE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
     -- Only the trusted installing operator may retain existing platform-wide
     -- SELECT; browser and runtime roles must have zero effective data authority.
     expected_read:=role_name=current_user::text AND pg_has_role(role_name,'pg_read_all_data','USAGE');
     FOR r IN SELECT oid,relkind FROM pg_class WHERE relnamespace=s::regnamespace AND relkind IN ('r','S') LOOP
       IF r.relkind='r' AND ((has_table_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR (has_any_column_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR has_table_privilege(role_name,r.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         OR has_any_column_privilege(role_name,r.oid,'INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private data access'; END IF;
       IF r.relkind='S' AND ((has_sequence_privilege(role_name,r.oid,'SELECT') IS DISTINCT FROM expected_read)
         OR has_sequence_privilege(role_name,r.oid,'USAGE,UPDATE')) THEN RAISE EXCEPTION 'Unexpected effective sequence access'; END IF;
     END LOOP;
     FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace=s::regnamespace LOOP
       expected:=(role_name=current_user::text AND f.proname IN ('operator_status','operator_set_enabled'))
         OR (role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END) AND f.proname='repository');
       IF has_function_privilege(role_name,f.oid,'EXECUTE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
     END LOOP;
   END LOOP;
 END LOOP;
END $postflight$;
DO $constraint$
BEGIN
 IF NOT EXISTS(SELECT FROM pg_constraint c JOIN pg_index i ON i.indexrelid=c.conindid
   WHERE c.conrelid='tll_provisional_private.intents'::regclass AND c.conname='provisional_browser_once'
     AND c.contype='u' AND c.convalidated AND NOT c.condeferrable AND NOT c.condeferred
     AND c.conkey=ARRAY[(SELECT attnum FROM pg_attribute WHERE attrelid=c.conrelid AND attname='browser_hash')]::smallint[]
     AND i.indisunique AND i.indisvalid AND i.indisready AND i.indpred IS NULL AND i.indexprs IS NULL) THEN
   RAISE EXCEPTION 'Exact permanent browser uniqueness required'; END IF;
END $constraint$;
COMMIT;
