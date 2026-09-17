-- Forward maintenance-authority repair for installed 004. Never replay 004.
-- Historical 004 SHA256: 030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76.
-- Requires a trusted nonsuperuser CREATEROLE installer that owns the schema/tables.
-- No LOGIN, password, activation, data rewrite or private history mutation.
-- New role names are intentional: the retired 004 roles cannot be administered.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
set local search_path=pg_catalog;
do $entry$ begin
  if current_setting('server_version_num')::integer<170000 or current_user<>session_user or not exists(select from pg_roles where rolname=current_user and not rolsuper and rolcreaterole) then raise exception 'Inventory maintenance: PostgreSQL17+ nonsuperuser installer required'; end if;
  if to_regnamespace('tll_inventory_private') is null or exists(select from pg_roles where rolname in('tll_inventory_owner_v2','tll_inventory_worker_v2','tll_inventory_role_setup')) then raise exception 'Inventory maintenance: missing predecessor or role collision; do not replay'; end if;
  if pg_get_userbyid((select nspowner from pg_namespace where nspname='tll_inventory_private')) is distinct from current_user or exists(select from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r' and relowner<>current_user::regrole) then raise exception 'Inventory maintenance: installer must own predecessor schema/tables'; end if;
end $entry$;
-- No worker can cross a write boundary while function OIDs/triggers are replaced.
lock table tll_inventory_private.control,tll_inventory_private.operations,tll_inventory_private.events in access exclusive mode;
do $preflight$
declare v_owner text:='tll_inventory_owner'; v_worker text:='tll_inventory_worker'; r text; obj record; fn record; actual jsonb; expected jsonb; ledger_valid boolean;
begin
  if current_user<>session_user or not exists(select from pg_roles where rolname=current_user and not rolsuper and rolcreaterole) then raise exception 'Inventory maintenance: exact nonsuperuser installer session required'; end if;
  if pg_get_userbyid((select nspowner from pg_namespace where nspname='tll_inventory_private')) is distinct from current_user then raise exception 'Inventory maintenance: installer must own existing schema'; end if;
  if (select count(*) from tll_inventory_private.control)<>1 or not exists(select from tll_inventory_private.control where singleton and enabled=false) then raise exception 'Inventory maintenance: disabled singleton control required'; end if;
  if (select count(*) from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind not in('i'))<>3 or exists(select from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind<>'i' and (relkind<>'r' or relname<>all(array['control','operations','events']) or relowner<>current_user::regrole or not relrowsecurity or relforcerowsecurity or relispartition)) then raise exception 'Inventory maintenance: exact tables/ownership/RLS required'; end if;
  foreach r in array array['tll_inventory_owner','tll_inventory_worker',v_owner,v_worker] loop
    if not exists(select from pg_roles where rolname=r and not(rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit) and rolconnlimit=-1 and rolvaliduntil is null and rolconfig is null) then raise exception 'Inventory maintenance: role flags mismatch'; end if;
  end loop;
  -- Exact ACL sets include grantor, unrelated grantees and grant options.
  select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantee),pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) into actual
    from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='tll_inventory_private';
  select jsonb_agg(jsonb_build_array(g::regrole::text,current_user,p,false) order by g,p) into expected from(values(current_user::regrole::oid,'CREATE'),(current_user::regrole::oid,'USAGE'),(v_owner::regrole::oid,'USAGE'),(v_worker::regrole::oid,'USAGE')) e(g,p);
  if actual is distinct from expected then raise exception 'Inventory maintenance: schema ACL mismatch'; end if;
  for obj in select * from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r' loop
    select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) into actual from aclexplode(coalesce(obj.relacl,acldefault('r',obj.relowner))) a;
    select jsonb_agg(jsonb_build_array(g::regrole::text,current_user,p,false) order by g,p) into expected from(
      select current_user::regrole::oid g,unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
      union all select v_owner::regrole::oid,unnest(case obj.relname when 'control' then array['SELECT'] when 'operations' then array['SELECT','INSERT','UPDATE'] else array['SELECT','INSERT'] end)) e;
    if actual is distinct from expected or exists(select from pg_attribute where attrelid=obj.oid and attacl is not null) then raise exception 'Inventory maintenance: table/column ACL mismatch'; end if;
  end loop;
  if (select count(*) from pg_policy where polrelid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace))<>4 then raise exception 'Inventory maintenance: policy count mismatch'; end if;
  for obj in select * from(values('control','inventory_control_read','r','true',null),('operations','inventory_operations_owner','*','true','true'),('events','inventory_events_read','r','true',null),('events','inventory_events_insert','a',null,'true')) e(tbl,name,cmd,qual,check_expr) loop
    if not exists(select from pg_policy where polrelid=to_regclass('tll_inventory_private.'||obj.tbl) and polname=obj.name and polcmd::text=obj.cmd and polpermissive and polroles=array[v_owner::regrole::oid] and pg_get_expr(polqual,polrelid) is not distinct from obj.qual and pg_get_expr(polwithcheck,polrelid) is not distinct from obj.check_expr) then raise exception 'Inventory maintenance: policy semantics mismatch'; end if;
  end loop;
  if (select count(*) from pg_trigger where tgrelid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace) and not tgisinternal)<>2 then raise exception 'Inventory maintenance: trigger count mismatch'; end if;
  for obj in select * from(values('operations','immutable_inventory_operation','immutable_operation'),('events','immutable_inventory_event','immutable_event')) e(tbl,name,fn) loop
    if not exists(select from pg_trigger where tgrelid=to_regclass('tll_inventory_private.'||obj.tbl) and tgname=obj.name and tgfoid=to_regprocedure('tll_inventory_private.'||obj.fn||'()') and tgenabled='O' and not tgisinternal and tgtype=27 and tgnargs=0 and tgargs=''::bytea and tgqual is null and tgconstraint=0 and tgparentid=0 and tgattr=''::int2vector and tgoldtable is null and tgnewtable is null) then raise exception 'Inventory maintenance: trigger semantics mismatch'; end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace='tll_inventory_private'::regnamespace)<>12 then raise exception 'Inventory maintenance: function count mismatch'; end if;
  for fn in select * from(values
    ('tll_inventory_private.immutable_operation()','55c59e17aab0e90b2e01a9cb23d39e3023c0d6bac5754ec6de4d34f120dbd9a4','trigger','plpgsql','v',false,null::text[],false),
    ('tll_inventory_private.immutable_event()','387d735d61259eb61de6a1ae5b14050868e675e661f3006fa67c403560ec686a','trigger','plpgsql','v',false,null::text[],false),
    ('tll_inventory_private.exact_keys(jsonb,text[])','89a9ba4df13a13025c03af6ed78f7b8fb5629a9d8f1d35484186965b7bdb870a','boolean','sql','i',false,array['v','keys']::text[],false),
    ('tll_inventory_private.valid_manifest(text)','f6355cdf0e7926a97e5d55681278e43e6d6dab2517b9d424b8951c0112961f60','boolean','plpgsql','i',false,array['p_document']::text[],false),
    ('tll_inventory_private.valid_observation(jsonb)','cd860823678825e1d29432349507ddb7b2961e21646b8456149c5ea961757905','boolean','plpgsql','i',false,array['o']::text[],false),
    ('tll_inventory_private.enqueue(text)','896b9885ee17e49e02e5375a00a678d73705705c1e6f3811be29bbd15f26c5f3','jsonb','plpgsql','v',true,array['p_manifest']::text[],true),
    ('tll_inventory_private.claim(uuid,uuid,integer)','65c1a04409b62e01cdb25d480677331f0a40dba319931b445bbc1e8b45dba534','jsonb','plpgsql','v',true,array['p_id','p_worker','p_lease_seconds']::text[],true),
    ('tll_inventory_private.begin_attempt(uuid,uuid,bigint,text)','3e05b4641495216a520d58005fc874f59cd9f91a318a07b6c7cb217108a16f15','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_request_hash']::text[],true),
    ('tll_inventory_private.begin_reconciliation(uuid,uuid,bigint,text,text)','8f27ca425b4f5dc2c27a87d7bf989c47aac81c80c7bd0db7bbaecfbcf351f03e','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_outcome','p_group_id']::text[],true),
    ('tll_inventory_private.finish_reconciliation(uuid,uuid,bigint,uuid,text,jsonb)','68c04b88d351fac9f3dc97170a2146cce38054246abf8fcc19787dccae3a08db','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_token','p_result','p_observation']::text[],true),
    ('tll_inventory_private.inspect_operation(uuid)','852e32df95a75a3aae65cfb5c58c10dbfa7111a5df91b07079413451a26f6ab6','jsonb','sql','s',true,array['p_id']::text[],true),
    ('tll_inventory_private.cancel_never_attempted(uuid,uuid)','fa1786f6e802c81fca5ceac97267536796fcb077152d219db88d7321a75846bb','jsonb','plpgsql','v',true,array['p_id','p_evidence_id']::text[],false)
  ) e(signature,hash,return_type,language,volatility,security_definer,arg_names,worker_execute) loop
    select p.* into obj from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(fn.signature) and p.proowner=v_owner::regrole and p.prorettype=to_regtype(fn.return_type) and l.lanname=fn.language and p.provolatile::text=fn.volatility and p.prosecdef=fn.security_definer and p.proargnames is not distinct from fn.arg_names and p.proargmodes is null and p.proargdefaults is null and p.pronargdefaults=0 and p.provariadic=0 and not p.proisstrict and not p.proleakproof and not p.proretset and p.prokind='f' and p.proparallel='u' and p.prosupport=0 and p.procost=100 and p.prorows=0 and p.proconfig=array['search_path=""']::text[] and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=fn.hash;
    if not found then raise exception 'Inventory maintenance: function body/signature/configuration mismatch: %',fn.signature; end if;
    select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee) into actual from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner))) a;
    select jsonb_agg(jsonb_build_array(g::regrole::text,v_owner,'EXECUTE',false) order by g) into expected from(
      select v_owner::regrole::oid g union all select v_worker::regrole::oid where fn.worker_execute
      union all select current_user::regrole::oid where obj.proname='cancel_never_attempted') e;
    if actual is distinct from expected then raise exception 'Inventory maintenance: function ACL mismatch'; end if;
  end loop;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attcollation::regcollation::text,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='tll_inventory_private'::regnamespace and c.relkind='r')::text,'UTF8')),'hex')) is distinct from '165d1dd4d11b6e33606e748644ac6b35c41edf39720445607e32db965142b1a8' then raise exception 'Inventory maintenance: canonical column structure mismatch'; end if;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid,true)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='tll_inventory_private'::regnamespace)::text,'UTF8')),'hex')) is distinct from '8798505ef7e06944c143bd9d5dec5ffdc73410ef1ba1f9ac846e2b9547670d68' then raise exception 'Inventory maintenance: canonical constraint structure mismatch'; end if;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname) from pg_index i join pg_class c on c.oid=i.indexrelid where c.relnamespace='tll_inventory_private'::regnamespace)::text,'UTF8')),'hex')) is distinct from 'c17aa6a1f5127f8bd8700479d42cb05065fa1bd59148f55596a5c4b0c594b969' then raise exception 'Inventory maintenance: canonical index structure mismatch'; end if;
  foreach r in array array['anon','authenticated','service_role',v_worker] loop
    if has_schema_privilege(r,'tll_inventory_private','CREATE') or has_schema_privilege(r,'tll_inventory_private','USAGE') is distinct from (r=v_worker) then raise exception 'Inventory maintenance: effective schema authority mismatch'; end if;
    for obj in select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r' loop
      if has_table_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inventory maintenance: effective table authority mismatch'; end if;
    end loop;
    for obj in select oid,proname from pg_proc where pronamespace='tll_inventory_private'::regnamespace loop
      if has_function_privilege(r,obj.oid,'EXECUTE') is distinct from (r=v_worker and obj.proname=any(array['enqueue','claim','begin_attempt','begin_reconciliation','finish_reconciliation','inspect_operation'])) then raise exception 'Inventory maintenance: effective function authority mismatch'; end if;
    end loop;
  end loop;
  if exists(select from pg_auth_members where roleid in(v_owner::regrole,v_worker::regrole) or member in(v_owner::regrole,v_worker::regrole)) then raise exception 'Inventory maintenance: retired roles must have no memberships'; end if;
  -- Refuse extra dependencies on the historical roles, including other databases.
  if exists(select from pg_shdepend d where d.refclassid='pg_authid'::regclass and d.refobjid in(v_owner::regrole,v_worker::regrole) and not(
    d.dbid=(select oid from pg_database where datname=current_database()) and d.objsubid=0 and (
      (d.classid='pg_proc'::regclass and d.objid in(select oid from pg_proc where pronamespace='tll_inventory_private'::regnamespace) and d.deptype in('o','a')) or
      (d.classid='pg_class'::regclass and d.objid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r') and d.deptype='a') or
      (d.classid='pg_namespace'::regclass and d.objid='tll_inventory_private'::regnamespace and d.deptype='a') or
      (d.classid='pg_policy'::regclass and d.objid in(select oid from pg_policy where polrelid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace)) and d.deptype='r')))) then raise exception 'Inventory maintenance: unexpected historical role dependency'; end if;
  -- Hosted source ledger, when present, must agree; this migration never edits it.
  if to_regclass('tll_staging_private.applied_migrations') is not null then
    execute 'select exists(select from tll_staging_private.applied_migrations where version=''202609150004_inventory_operation_ledger'' and source_sha256=''030ccb26228aca6665147eced447815f8a290abd74b8003b0f32bfb2a05e5a76'')' into ledger_valid;
    if ledger_valid is distinct from true then raise exception 'Inventory maintenance: historical source ledger mismatch'; end if;
  end if;
end $preflight$;

-- The installing role creates these directly, retaining PG17 bootstrap-granted
-- ADMIN only. A separately granted SET edge exists solely inside this transaction.
set local createrole_self_grant='';
create role tll_inventory_owner_v2 nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
create role tll_inventory_worker_v2 nologin noinherit nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
do $setup$ begin
  execute format('grant tll_inventory_owner_v2 to %I with admin false,inherit false,set true',current_user);
end $setup$;
grant usage,create on schema tll_inventory_private to tll_inventory_owner_v2;
grant usage on schema tll_inventory_private to tll_inventory_worker_v2;
grant select on tll_inventory_private.control to tll_inventory_owner_v2;
grant select,insert,update on tll_inventory_private.operations to tll_inventory_owner_v2;
grant select,insert on tll_inventory_private.events to tll_inventory_owner_v2;
alter policy inventory_control_read on tll_inventory_private.control to tll_inventory_owner_v2;
alter policy inventory_operations_owner on tll_inventory_private.operations to tll_inventory_owner_v2;
alter policy inventory_events_read on tll_inventory_private.events to tll_inventory_owner_v2;
alter policy inventory_events_insert on tll_inventory_private.events to tll_inventory_owner_v2;
-- Schema/table ownership legitimately permits these precise removals. RESTRICT
-- refuses unexpected dependent objects. No CASCADE or table reconstruction.
drop trigger immutable_inventory_operation on tll_inventory_private.operations;
drop trigger immutable_inventory_event on tll_inventory_private.events;
drop function tll_inventory_private.immutable_operation(),
  tll_inventory_private.immutable_event(),
  tll_inventory_private.exact_keys(jsonb,text[]),
  tll_inventory_private.valid_manifest(text),
  tll_inventory_private.valid_observation(jsonb),
  tll_inventory_private.enqueue(text),
  tll_inventory_private.claim(uuid,uuid,integer),
  tll_inventory_private.begin_attempt(uuid,uuid,bigint,text),
  tll_inventory_private.begin_reconciliation(uuid,uuid,bigint,text,text),
  tll_inventory_private.finish_reconciliation(uuid,uuid,bigint,uuid,text,jsonb),
  tll_inventory_private.inspect_operation(uuid),
  tll_inventory_private.cancel_never_attempted(uuid,uuid) restrict;

-- Exact canonical 004 function statements, preserving signature and body bytes.
create function tll_inventory_private.immutable_operation() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or row(new.operation_id,new.manifest_document,new.manifest_sha256,new.request_document,new.request_hash,new.shop_domain,new.shop_id,new.inventory_item_id,new.location_id,new.expected_available,new.desired_available,new.binding_hash,new.expires_at,new.created_at)
    is distinct from row(old.operation_id,old.manifest_document,old.manifest_sha256,old.request_document,old.request_hash,old.shop_domain,old.shop_id,old.inventory_item_id,old.location_id,old.expected_available,old.desired_available,old.binding_hash,old.expires_at,old.created_at) then
    raise exception 'Immutable inventory operation' using errcode='23514';
  end if;
  return new;
end $$;

create function tll_inventory_private.immutable_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Append-only inventory events' using errcode='23514'; end $$;

create function tll_inventory_private.exact_keys(v jsonb, keys text[]) returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(v)='object' and (select count(*) from jsonb_object_keys(v))=cardinality(keys)
    and not exists(select 1 from jsonb_object_keys(v) k where not k=any(keys))
$$;

create function tll_inventory_private.valid_manifest(p_document text) returns boolean language plpgsql immutable set search_path='' as $$
declare m jsonb; p jsonb; b jsonb; provenance jsonb; doc jsonb; body jsonb; vars jsonb; inp jsonb; q jsonb; r jsonb; k text; i integer;
begin
  if p_document is null or octet_length(p_document)>32768 or not (p_document is json object with unique keys) then return false; end if;
  m:=p_document::jsonb; p:=m->'plan'; b:=m->'binding'; provenance:=m->'provenance';
  if jsonb_path_exists(m,'$.** ? (@ == null)') then return false; end if;
  if not tll_inventory_private.exact_keys(m,array['schemaVersion','endpoint','requestDocument','plan','binding','provenance'])
    or m->>'schemaVersion'<>'tll-inventory-operation/v1'
    or not tll_inventory_private.exact_keys(p,array['apiVersion','operationId','requestHash','createdAtMs','expiresAtMs','bindingHash','mappingVersion','stockVersion','expectedAvailable','desiredAvailable','request'])
    or p->>'apiVersion'<>'2026-07' or p->>'operationId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or not tll_inventory_private.exact_keys(b,array['review','shopDomain','shopId','mappingVersion','shopifyProductId','shopifyProductHandle','shopifyVariantId','inventoryItemId','locationId','shopifySku'])
    or b->>'shopDomain' !~ '^([a-z0-9]|[a-z0-9][a-z0-9-]{0,61}[a-z0-9])\.myshopify\.com$'
    or b->>'shopId' !~ '^gid://shopify/Shop/[1-9][0-9]{0,19}$'
    or b->>'inventoryItemId' !~ '^gid://shopify/InventoryItem/[1-9][0-9]{0,19}$'
    or b->>'locationId' !~ '^gid://shopify/Location/[1-9][0-9]{0,19}$'
    or b->>'shopifyProductId' !~ '^gid://shopify/Product/[1-9][0-9]{0,19}$'
    or b->>'shopifyVariantId' !~ '^gid://shopify/ProductVariant/[1-9][0-9]{0,19}$'
    or b->>'shopifyProductHandle' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or length(b->>'shopifySku') not between 1 and 256
    or m->>'endpoint' is distinct from 'https://'||(b->>'shopDomain')||'/admin/api/2026-07/graphql.json'
    or p->>'bindingHash' is distinct from encode(sha256(convert_to((p_document::json->'binding')::text,'UTF8')),'hex') then return false; end if;
  if not tll_inventory_private.exact_keys(provenance,array['policyReview','mappingReview','stockReview','mappingProductId','supplierSku','formulaIdentity','stockPackVersion','stockBasis','stockObservedAtMs','readObservedAtMs'])
    or provenance->>'stockBasis'<>'reconciled_sellable_units' or jsonb_typeof(provenance->'formulaIdentity')<>'array' or jsonb_array_length(provenance->'formulaIdentity')<>9
    or provenance->'formulaIdentity'->>4 is distinct from provenance->>'stockPackVersion'
    or p->>'mappingVersion' is distinct from b->>'mappingVersion'
    or p->>'mappingVersion' is distinct from provenance->'mappingReview'->>'version'
    or p->>'stockVersion' is distinct from provenance->'stockReview'->>'version' then return false; end if;
  foreach k in array array['mappingProductId','supplierSku','stockPackVersion'] loop
    if jsonb_typeof(provenance->k)<>'string' or length(provenance->>k) not between 1 and 256 then return false; end if;
  end loop;
  foreach k in array array['mappingVersion','shopifySku'] loop
    if jsonb_typeof(b->k)<>'string' or length(b->>k) not between 1 and 256 then return false; end if;
  end loop;
  for i in 0..4 loop
    if jsonb_typeof(provenance->'formulaIdentity'->i)<>'string' or length(provenance->'formulaIdentity'->>i) not between 1 and 256 then return false; end if;
  end loop;
  q:=provenance->'formulaIdentity';
  if q->>5 not in ('single','multipack','case') or q->>8 not in ('g','ml','tablet','capsule','bar','bottle','sachet')
    or jsonb_typeof(q->6)<>'number' or q->>6 !~ '^[0-9]{1,5}$' or (q->>6)::integer not between 1 and 10000
    or (q->>5='single' and q->>6<>'1') or jsonb_typeof(q->7)<>'number' or (q->>7)::numeric<=0 or (q->>7)::numeric>1000000000
    or (q->>8 not in ('g','ml') and (q->>7)::numeric<>trunc((q->>7)::numeric)) then return false; end if;
  foreach k in array array['createdAtMs','expiresAtMs'] loop
    if jsonb_typeof(p->k)<>'number' or p->>k !~ '^[0-9]{1,16}$' or (p->>k)::numeric>9007199254740991 then return false; end if;
  end loop;
  if (p->>'expiresAtMs')::numeric<=(p->>'createdAtMs')::numeric then return false; end if;
  for r in select value from jsonb_array_elements(jsonb_build_array(b->'review',provenance->'policyReview',provenance->'mappingReview',provenance->'stockReview')) loop
    if not tll_inventory_private.exact_keys(r,array['approved','version','expectedVersion','verifiedAtMs','expiresAtMs']) or r->'approved'<>'true'::jsonb
      or jsonb_typeof(r->'version')<>'string' or jsonb_typeof(r->'expectedVersion')<>'string'
      or r->>'version' is distinct from r->>'expectedVersion' or length(r->>'version') not between 1 and 256
      or jsonb_typeof(r->'verifiedAtMs')<>'number' or r->>'verifiedAtMs' !~ '^[0-9]{1,16}$'
      or jsonb_typeof(r->'expiresAtMs')<>'number' or r->>'expiresAtMs' !~ '^[0-9]{1,16}$'
      or (r->>'verifiedAtMs')::numeric>(p->>'createdAtMs')::numeric or (r->>'expiresAtMs')::numeric<(p->>'expiresAtMs')::numeric then return false; end if;
  end loop;
  foreach k in array array['stockObservedAtMs','readObservedAtMs'] loop
    if jsonb_typeof(provenance->k)<>'number' or provenance->>k !~ '^[0-9]{1,16}$' or (provenance->>k)::numeric>(p->>'createdAtMs')::numeric then return false; end if;
  end loop;
  if not ((m->>'requestDocument') is json object with unique keys) then return false; end if;
  doc:=(m->>'requestDocument')::jsonb; body:=doc->'body'; vars:=body->'variables'; inp:=vars->'input';
  if not tll_inventory_private.exact_keys(doc,array['endpoint','body']) or doc->>'endpoint' is distinct from m->>'endpoint'
    or p->>'requestHash' is distinct from encode(sha256(convert_to(m->>'requestDocument','UTF8')),'hex')
    or p->'request' is distinct from body or not tll_inventory_private.exact_keys(body,array['operationName','query','variables'])
    or body->>'operationName'<>'TllInventorySet'
    or encode(sha256(convert_to(body->>'query','UTF8')),'hex')<>'feeefddd011b10465a13ee4cfa55b8ea243d1f08921d7fa2c1f31fd5734bbdec'
    or not tll_inventory_private.exact_keys(vars,array['input','idempotencyKey']) or vars->>'idempotencyKey' is distinct from p->>'operationId'
    or not tll_inventory_private.exact_keys(inp,array['name','reason','referenceDocumentUri','quantities']) or inp->>'name'<>'available' or inp->>'reason'<>'correction'
    or inp->>'referenceDocumentUri' is distinct from 'gid://tll/InventorySync/'||(p->>'operationId')
    or jsonb_typeof(inp->'quantities')<>'array' or jsonb_array_length(inp->'quantities')<>1 then return false; end if;
  q:=inp->'quantities'->0;
  if not tll_inventory_private.exact_keys(q,array['inventoryItemId','locationId','quantity','changeFromQuantity'])
    or q->>'inventoryItemId' is distinct from b->>'inventoryItemId' or q->>'locationId' is distinct from b->>'locationId'
    or q->'quantity' is distinct from p->'desiredAvailable' or q->'changeFromQuantity' is distinct from p->'expectedAvailable'
    or jsonb_typeof(q->'quantity')<>'number' or q->>'quantity' !~ '^[0-9]{1,10}$' or (q->>'quantity')::numeric>2147483647
    or jsonb_typeof(q->'changeFromQuantity')<>'number' or q->>'changeFromQuantity' !~ '^-?[0-9]{1,10}$'
    or (q->>'changeFromQuantity')::numeric not between -2147483648 and 2147483647
    or q->'quantity'=q->'changeFromQuantity' then return false; end if;
  return true;
exception when others then return false;
end $$;

create function tll_inventory_private.valid_observation(o jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb;
begin
  if o is null or octet_length(o::text)>4096 or not tll_inventory_private.exact_keys(o,array['apiVersion','bindingHash','observedAtMs','productStatus','inventoryPolicy','requiresComponents','tracked','linkedVariantIds','linkedVariantsTruncated','level'])
    or o->>'apiVersion' is distinct from '2026-07' or o->>'bindingHash' !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(o->'observedAtMs')<>'number' or o->>'observedAtMs' !~ '^[0-9]{1,16}$' or (o->>'observedAtMs')::numeric>9007199254740991
    or o->>'productStatus' not in ('ACTIVE','DRAFT','ARCHIVED','UNLISTED') or o->>'inventoryPolicy' not in ('DENY','CONTINUE')
    or jsonb_typeof(o->'linkedVariantIds')<>'array' or jsonb_array_length(o->'linkedVariantIds')>2 then return false; end if;
  -- Only a missing level is allowed to be JSON null. Unknown is never zero.
  if jsonb_path_exists(o-'level','$.** ? (@ == null)') then return false; end if;
  foreach k in array array['requiresComponents','tracked','linkedVariantsTruncated'] loop
    if jsonb_typeof(o->k)<>'boolean' then return false; end if;
  end loop;
  for v in select value from jsonb_array_elements(o->'linkedVariantIds') loop
    if jsonb_typeof(v)<>'string' or v #>> '{}' !~ '^gid://shopify/ProductVariant/[1-9][0-9]{0,19}$' then return false; end if;
  end loop;
  if (select count(distinct value) from jsonb_array_elements(o->'linkedVariantIds'))<>jsonb_array_length(o->'linkedVariantIds')
    or (o->'linkedVariantsTruncated'='true'::jsonb and jsonb_array_length(o->'linkedVariantIds')<>2) then return false; end if;
  v:=o->'level';
  if v<>'null'::jsonb and (not tll_inventory_private.exact_keys(v,array['active','locationActive','available'])
    or jsonb_typeof(v->'active')<>'boolean' or jsonb_typeof(v->'locationActive')<>'boolean'
    or jsonb_typeof(v->'available')<>'number' or v->>'available' !~ '^-?[0-9]{1,10}$'
    or (v->>'available')::numeric not between -2147483648 and 2147483647 or jsonb_path_exists(v,'$.** ? (@ == null)')) then return false; end if;
  return true;
exception when others then return false;
end $$;

create function tll_inventory_private.enqueue(p_manifest text) returns jsonb language plpgsql security definer set search_path='' as $$
declare m jsonb; p jsonb; b jsonb; existing tll_inventory_private.operations%rowtype; digest text;
begin
  if tll_inventory_private.valid_manifest(p_manifest) is not true then return jsonb_build_object('status','invalid'); end if;
  m:=p_manifest::jsonb; p:=m->'plan'; b:=m->'binding'; digest:=encode(sha256(convert_to(p_manifest,'UTF8')),'hex');
  -- Serialize same IDs and competing target inserts before the uniqueness check.
  perform pg_advisory_xact_lock(hashtextextended((p->>'operationId'),7127));
  select * into existing from tll_inventory_private.operations where operation_id=(p->>'operationId')::uuid;
  if found then
    if existing.manifest_sha256=digest and existing.manifest_document=p_manifest then return jsonb_build_object('status','existing','operation_id',existing.operation_id,'state',existing.state); end if;
    return jsonb_build_object('status','operation_conflict');
  end if;
  if to_timestamp((p->>'expiresAtMs')::numeric/1000)<=clock_timestamp() or to_timestamp((p->>'createdAtMs')::numeric/1000)>clock_timestamp()+interval '30 seconds' then return jsonb_build_object('status','expired'); end if;
  begin
    insert into tll_inventory_private.operations(operation_id,manifest_document,manifest_sha256,request_document,request_hash,shop_domain,shop_id,inventory_item_id,location_id,expected_available,desired_available,binding_hash,expires_at)
      values((p->>'operationId')::uuid,p_manifest,digest,m->>'requestDocument',p->>'requestHash',b->>'shopDomain',b->>'shopId',b->>'inventoryItemId',b->>'locationId',(p->>'expectedAvailable')::integer,(p->>'desiredAvailable')::integer,p->>'bindingHash',to_timestamp((p->>'expiresAtMs')::numeric/1000));
  exception when unique_violation then return jsonb_build_object('status','target_busy'); end;
  insert into tll_inventory_private.events(operation_id,event_name,fence) values((p->>'operationId')::uuid,'enqueued',0);
  return jsonb_build_object('status','enqueued','operation_id',p->>'operationId','state','queued');
end $$;

create function tll_inventory_private.claim(p_id uuid,p_worker uuid,p_lease_seconds integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype; v_now timestamptz:=clock_timestamp(); recovery boolean;
begin
  if p_id is null or p_worker is null or p_lease_seconds is null or p_lease_seconds not between 1 and 300 then return jsonb_build_object('status','invalid'); end if;
  if (select enabled from tll_inventory_private.control where singleton) is not true then return jsonb_build_object('status','disabled'); end if;
  select * into op from tll_inventory_private.operations where operation_id=p_id for update skip locked;
  if not found then return jsonb_build_object('status','unavailable'); end if;
  v_now:=clock_timestamp();
  if op.state in ('held','completed','cancelled') or (op.lease_until is not null and op.lease_until>v_now) then return jsonb_build_object('status','unavailable'); end if;
  recovery:=op.state<>'queued' or op.expires_at<=v_now;
  update tll_inventory_private.operations set state=case when recovery then 'reconciling' else 'claimed' end,fence=fence+1,worker_id=p_worker,lease_until=v_now+make_interval(secs=>p_lease_seconds),reconcile_token=case when recovery then gen_random_uuid() else null end,reconcile_started_at=case when recovery then v_now else null end
    where operation_id=p_id returning * into op;
  insert into tll_inventory_private.events(operation_id,event_name,fence,worker_id) values(p_id,case when recovery then 'recovery_claimed' else 'claimed' end,op.fence,p_worker);
  return jsonb_build_object('status','claimed','mode',case when recovery then 'reconcile_only' else 'first_attempt' end,'operation_id',p_id,'fence',op.fence::text,'worker_id',p_worker,'lease_until',op.lease_until,'reconcile_token',op.reconcile_token,'manifest_document',op.manifest_document,'attempted',op.attempted_at is not null);
end $$;

create function tll_inventory_private.begin_attempt(p_id uuid,p_worker uuid,p_fence bigint,p_request_hash text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype; v_now timestamptz:=clock_timestamp();
begin
  select * into op from tll_inventory_private.operations where operation_id=p_id for update;
  v_now:=clock_timestamp();
  if not found or op.state<>'claimed' or op.worker_id is distinct from p_worker or op.fence is distinct from p_fence or op.lease_until<=v_now or op.request_hash is distinct from p_request_hash then return jsonb_build_object('status','fenced'); end if;
  if (select enabled from tll_inventory_private.control where singleton) is not true then return jsonb_build_object('status','disabled'); end if;
  if op.expires_at<=v_now then return jsonb_build_object('status','expired'); end if;
  update tll_inventory_private.operations set state='attempted',attempted_at=v_now,attempt_fence=p_fence where operation_id=p_id;
  insert into tll_inventory_private.events(operation_id,event_name,fence,worker_id) values(p_id,'attempt_committed',p_fence,p_worker);
  return jsonb_build_object('status','attempt_committed');
end $$;

create function tll_inventory_private.begin_reconciliation(p_id uuid,p_worker uuid,p_fence bigint,p_outcome text,p_group_id text) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype; token uuid:=gen_random_uuid();
begin
  select * into op from tll_inventory_private.operations where operation_id=p_id for update;
  if not found or op.state not in ('claimed','attempted') or op.worker_id is distinct from p_worker or op.fence is distinct from p_fence or op.lease_until<=clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  if p_outcome is null or p_outcome not in ('not_sent','acknowledged','unknown','rejected')
    or (op.state='claimed' and p_outcome<>'not_sent') or (op.state='attempted' and p_outcome='not_sent')
    or (p_outcome='acknowledged' and (p_group_id is null or p_group_id !~ '^gid://shopify/InventoryAdjustmentGroup/[A-Za-z0-9_-]{1,128}$'))
    or (p_outcome<>'acknowledged' and p_group_id is not null) then return jsonb_build_object('status','invalid'); end if;
  update tll_inventory_private.operations set state='reconciling',outcome=nullif(p_outcome,'not_sent'),reconcile_token=token,reconcile_started_at=clock_timestamp(),
    adjustment_group_id=p_group_id,acknowledgement_fence=case when p_outcome='acknowledged' then p_fence else null end where operation_id=p_id;
  insert into tll_inventory_private.events(operation_id,event_name,fence,worker_id) values(p_id,'reconciliation_started_'||p_outcome,p_fence,p_worker);
  return jsonb_build_object('status','reconciling','reconcile_token',token);
end $$;

create function tll_inventory_private.finish_reconciliation(p_id uuid,p_worker uuid,p_fence bigint,p_token uuid,p_result text,p_observation jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype; complete boolean; b jsonb;
begin
  select * into op from tll_inventory_private.operations where operation_id=p_id for update;
  if not found or op.state<>'reconciling' or op.worker_id is distinct from p_worker or op.fence is distinct from p_fence or p_token is null or op.reconcile_token is distinct from p_token or op.lease_until<=clock_timestamp() then return jsonb_build_object('status','fenced'); end if;
  if p_result is null or p_result not in ('reconciled','hold') then return jsonb_build_object('status','invalid'); end if;
  b:=op.manifest_document::jsonb->'binding';
  if p_observation is not null and (tll_inventory_private.valid_observation(p_observation) is not true
    or p_observation->>'bindingHash' is distinct from op.binding_hash) then return jsonb_build_object('status','invalid'); end if;
  complete:=p_result='reconciled';
  if complete and (op.outcome is distinct from 'acknowledged' or op.attempt_fence is distinct from p_fence or op.acknowledgement_fence is distinct from p_fence
    or p_observation is null or (p_observation->>'observedAtMs')::numeric<floor(extract(epoch from op.reconcile_started_at)*1000)
    or (p_observation->>'observedAtMs')::numeric>extract(epoch from clock_timestamp())*1000+30000
    or p_observation->>'productStatus' is distinct from 'ACTIVE' or p_observation->>'inventoryPolicy' is distinct from 'DENY'
    or p_observation->'requiresComponents' is distinct from 'false'::jsonb or p_observation->'tracked' is distinct from 'true'::jsonb
    or p_observation->'linkedVariantsTruncated' is distinct from 'false'::jsonb or p_observation->'linkedVariantIds' is distinct from jsonb_build_array(b->>'shopifyVariantId')
    or p_observation->'level'->'active' is distinct from 'true'::jsonb or p_observation->'level'->'locationActive' is distinct from 'true'::jsonb
    or p_observation->'level'->'available' is distinct from to_jsonb(op.desired_available)) then return jsonb_build_object('status','invalid'); end if;
  update tll_inventory_private.operations set state=case when complete then 'completed' else 'held' end,worker_id=null,lease_until=null,reconcile_token=null,
    last_observation=p_observation,hold_reason=case when complete then null when attempted_at is null then 'not_attempted_requires_new_plan' else 'attempt_outcome_requires_review' end,finished_at=case when complete then clock_timestamp() else null end where operation_id=p_id;
  insert into tll_inventory_private.events(operation_id,event_name,fence,worker_id) values(p_id,case when complete then 'completed' else 'held' end,p_fence,p_worker);
  return jsonb_build_object('status',case when complete then 'completed' else 'held' end);
end $$;

create function tll_inventory_private.inspect_operation(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('operation_id',operation_id,'state',state,'fence',fence::text,'worker_id',worker_id,'lease_until',lease_until,'attempted',attempted_at is not null,'manifest_document',manifest_document,'request_hash',request_hash,'hold_reason',hold_reason)
    from tll_inventory_private.operations where operation_id=p_id
$$;

create function tll_inventory_private.cancel_never_attempted(p_id uuid,p_evidence_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype;
begin
  select * into op from tll_inventory_private.operations where operation_id=p_id for update;
  if not found or op.state<>'held' or op.attempted_at is not null or p_evidence_id is null then return jsonb_build_object('status','unavailable'); end if;
  update tll_inventory_private.operations set state='cancelled',finished_at=clock_timestamp() where operation_id=p_id;
  insert into tll_inventory_private.events(operation_id,event_name,fence) values(p_id,'operator_cancelled_never_attempted:'||p_evidence_id,op.fence);
  return jsonb_build_object('status','cancelled');
end $$;

-- Remove all creation-time ACLs, including unrelated default grantees, before
-- transfer. The postflight requires exact grantors, grantees and grant options.
do $transfer$ declare obj record; g record; begin
  for obj in select oid,oid::regprocedure as signature from pg_proc where pronamespace='tll_inventory_private'::regnamespace loop
    for g in select distinct grantee from aclexplode(coalesce((select proacl from pg_proc where oid=obj.oid),acldefault('f',current_user::regrole))) where grantee<>current_user::regrole loop
      execute format('revoke all on function %s from %s',obj.signature,case when g.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(g.grantee)) end);
    end loop;
    execute format('alter function %s owner to tll_inventory_owner_v2',obj.signature);
  end loop;
end $transfer$;
do $grants$ declare installer name:=current_user; begin
  set local role tll_inventory_owner_v2;
  grant execute on function tll_inventory_private.enqueue(text),tll_inventory_private.claim(uuid,uuid,integer),tll_inventory_private.begin_attempt(uuid,uuid,bigint,text),tll_inventory_private.begin_reconciliation(uuid,uuid,bigint,text,text),tll_inventory_private.finish_reconciliation(uuid,uuid,bigint,uuid,text,jsonb),tll_inventory_private.inspect_operation(uuid) to tll_inventory_worker_v2;
  execute format('grant execute on function tll_inventory_private.cancel_never_attempted(uuid,uuid),tll_inventory_private.immutable_operation(),tll_inventory_private.immutable_event() to %I',installer);
  execute format('set local role %I',installer);
end $grants$;
create trigger immutable_inventory_operation before update or delete on tll_inventory_private.operations for each row execute function tll_inventory_private.immutable_operation();
create trigger immutable_inventory_event before update or delete on tll_inventory_private.events for each row execute function tll_inventory_private.immutable_event();
do $retire$ declare installer name:=current_user; begin
  set local role tll_inventory_owner_v2;
  execute format('revoke execute on function tll_inventory_private.immutable_operation(),tll_inventory_private.immutable_event() from %I',installer);
  execute format('set local role %I',installer);
  execute format('revoke tll_inventory_owner_v2 from %I granted by %I',installer,installer);
end $retire$;
revoke create on schema tll_inventory_private from tll_inventory_owner_v2;
revoke all on all tables in schema tll_inventory_private from tll_inventory_owner,tll_inventory_worker;
revoke all on schema tll_inventory_private from tll_inventory_owner,tll_inventory_worker;

do $postflight$
declare v_owner text:='tll_inventory_owner_v2'; v_worker text:='tll_inventory_worker_v2'; r text; obj record; fn record; actual jsonb; expected jsonb;
begin
  if current_user<>session_user or not exists(select from pg_roles where rolname=current_user and not rolsuper and rolcreaterole) then raise exception 'Inventory maintenance: exact nonsuperuser installer session required'; end if;
  if pg_get_userbyid((select nspowner from pg_namespace where nspname='tll_inventory_private')) is distinct from current_user then raise exception 'Inventory maintenance: installer must own existing schema'; end if;
  if (select count(*) from tll_inventory_private.control)<>1 or not exists(select from tll_inventory_private.control where singleton and enabled=false) then raise exception 'Inventory maintenance: disabled singleton control required'; end if;
  if (select count(*) from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind not in('i'))<>3 or exists(select from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind<>'i' and (relkind<>'r' or relname<>all(array['control','operations','events']) or relowner<>current_user::regrole or not relrowsecurity or relforcerowsecurity or relispartition)) then raise exception 'Inventory maintenance: exact tables/ownership/RLS required'; end if;
  foreach r in array array['tll_inventory_owner','tll_inventory_worker',v_owner,v_worker] loop
    if not exists(select from pg_roles where rolname=r and not(rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit) and rolconnlimit=-1 and rolvaliduntil is null and rolconfig is null) then raise exception 'Inventory maintenance: role flags mismatch'; end if;
  end loop;
  -- Exact ACL sets include grantor, unrelated grantees and grant options.
  select jsonb_agg(jsonb_build_array(pg_get_userbyid(a.grantee),pg_get_userbyid(a.grantor),a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) into actual
    from pg_namespace n cross join lateral aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a where n.nspname='tll_inventory_private';
  select jsonb_agg(jsonb_build_array(g::regrole::text,current_user,p,false) order by g,p) into expected from(values(current_user::regrole::oid,'CREATE'),(current_user::regrole::oid,'USAGE'),(v_owner::regrole::oid,'USAGE'),(v_worker::regrole::oid,'USAGE')) e(g,p);
  if actual is distinct from expected then raise exception 'Inventory maintenance: schema ACL mismatch'; end if;
  for obj in select * from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r' loop
    select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee,a.privilege_type) into actual from aclexplode(coalesce(obj.relacl,acldefault('r',obj.relowner))) a;
    select jsonb_agg(jsonb_build_array(g::regrole::text,current_user,p,false) order by g,p) into expected from(
      select current_user::regrole::oid g,unnest(array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN']) p
      union all select v_owner::regrole::oid,unnest(case obj.relname when 'control' then array['SELECT'] when 'operations' then array['SELECT','INSERT','UPDATE'] else array['SELECT','INSERT'] end)) e;
    if actual is distinct from expected or exists(select from pg_attribute where attrelid=obj.oid and attacl is not null) then raise exception 'Inventory maintenance: table/column ACL mismatch'; end if;
  end loop;
  if (select count(*) from pg_policy where polrelid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace))<>4 then raise exception 'Inventory maintenance: policy count mismatch'; end if;
  for obj in select * from(values('control','inventory_control_read','r','true',null),('operations','inventory_operations_owner','*','true','true'),('events','inventory_events_read','r','true',null),('events','inventory_events_insert','a',null,'true')) e(tbl,name,cmd,qual,check_expr) loop
    if not exists(select from pg_policy where polrelid=to_regclass('tll_inventory_private.'||obj.tbl) and polname=obj.name and polcmd::text=obj.cmd and polpermissive and polroles=array[v_owner::regrole::oid] and pg_get_expr(polqual,polrelid) is not distinct from obj.qual and pg_get_expr(polwithcheck,polrelid) is not distinct from obj.check_expr) then raise exception 'Inventory maintenance: policy semantics mismatch'; end if;
  end loop;
  if (select count(*) from pg_trigger where tgrelid in(select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace) and not tgisinternal)<>2 then raise exception 'Inventory maintenance: trigger count mismatch'; end if;
  for obj in select * from(values('operations','immutable_inventory_operation','immutable_operation'),('events','immutable_inventory_event','immutable_event')) e(tbl,name,fn) loop
    if not exists(select from pg_trigger where tgrelid=to_regclass('tll_inventory_private.'||obj.tbl) and tgname=obj.name and tgfoid=to_regprocedure('tll_inventory_private.'||obj.fn||'()') and tgenabled='O' and not tgisinternal and tgtype=27 and tgnargs=0 and tgargs=''::bytea and tgqual is null and tgconstraint=0 and tgparentid=0 and tgattr=''::int2vector and tgoldtable is null and tgnewtable is null) then raise exception 'Inventory maintenance: trigger semantics mismatch'; end if;
  end loop;
  if (select count(*) from pg_proc where pronamespace='tll_inventory_private'::regnamespace)<>12 then raise exception 'Inventory maintenance: function count mismatch'; end if;
  for fn in select * from(values
    ('tll_inventory_private.immutable_operation()','55c59e17aab0e90b2e01a9cb23d39e3023c0d6bac5754ec6de4d34f120dbd9a4','trigger','plpgsql','v',false,null::text[],false),
    ('tll_inventory_private.immutable_event()','387d735d61259eb61de6a1ae5b14050868e675e661f3006fa67c403560ec686a','trigger','plpgsql','v',false,null::text[],false),
    ('tll_inventory_private.exact_keys(jsonb,text[])','89a9ba4df13a13025c03af6ed78f7b8fb5629a9d8f1d35484186965b7bdb870a','boolean','sql','i',false,array['v','keys']::text[],false),
    ('tll_inventory_private.valid_manifest(text)','f6355cdf0e7926a97e5d55681278e43e6d6dab2517b9d424b8951c0112961f60','boolean','plpgsql','i',false,array['p_document']::text[],false),
    ('tll_inventory_private.valid_observation(jsonb)','cd860823678825e1d29432349507ddb7b2961e21646b8456149c5ea961757905','boolean','plpgsql','i',false,array['o']::text[],false),
    ('tll_inventory_private.enqueue(text)','896b9885ee17e49e02e5375a00a678d73705705c1e6f3811be29bbd15f26c5f3','jsonb','plpgsql','v',true,array['p_manifest']::text[],true),
    ('tll_inventory_private.claim(uuid,uuid,integer)','65c1a04409b62e01cdb25d480677331f0a40dba319931b445bbc1e8b45dba534','jsonb','plpgsql','v',true,array['p_id','p_worker','p_lease_seconds']::text[],true),
    ('tll_inventory_private.begin_attempt(uuid,uuid,bigint,text)','3e05b4641495216a520d58005fc874f59cd9f91a318a07b6c7cb217108a16f15','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_request_hash']::text[],true),
    ('tll_inventory_private.begin_reconciliation(uuid,uuid,bigint,text,text)','8f27ca425b4f5dc2c27a87d7bf989c47aac81c80c7bd0db7bbaecfbcf351f03e','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_outcome','p_group_id']::text[],true),
    ('tll_inventory_private.finish_reconciliation(uuid,uuid,bigint,uuid,text,jsonb)','68c04b88d351fac9f3dc97170a2146cce38054246abf8fcc19787dccae3a08db','jsonb','plpgsql','v',true,array['p_id','p_worker','p_fence','p_token','p_result','p_observation']::text[],true),
    ('tll_inventory_private.inspect_operation(uuid)','852e32df95a75a3aae65cfb5c58c10dbfa7111a5df91b07079413451a26f6ab6','jsonb','sql','s',true,array['p_id']::text[],true),
    ('tll_inventory_private.cancel_never_attempted(uuid,uuid)','fa1786f6e802c81fca5ceac97267536796fcb077152d219db88d7321a75846bb','jsonb','plpgsql','v',true,array['p_id','p_evidence_id']::text[],false)
  ) e(signature,hash,return_type,language,volatility,security_definer,arg_names,worker_execute) loop
    select p.* into obj from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(fn.signature) and p.proowner=v_owner::regrole and p.prorettype=to_regtype(fn.return_type) and l.lanname=fn.language and p.provolatile::text=fn.volatility and p.prosecdef=fn.security_definer and p.proargnames is not distinct from fn.arg_names and p.proargmodes is null and p.proargdefaults is null and p.pronargdefaults=0 and p.provariadic=0 and not p.proisstrict and not p.proleakproof and not p.proretset and p.prokind='f' and p.proparallel='u' and p.prosupport=0 and p.procost=100 and p.prorows=0 and p.proconfig=array['search_path=""']::text[] and encode(sha256(convert_to(p.prosrc,'UTF8')),'hex')=fn.hash;
    if not found then raise exception 'Inventory maintenance: function body/signature/configuration mismatch: %',fn.signature; end if;
    select jsonb_agg(jsonb_build_array(a.grantee::regrole::text,a.grantor::regrole::text,a.privilege_type,a.is_grantable) order by a.grantee) into actual from aclexplode(coalesce(obj.proacl,acldefault('f',obj.proowner))) a;
    select jsonb_agg(jsonb_build_array(g::regrole::text,v_owner,'EXECUTE',false) order by g) into expected from(
      select v_owner::regrole::oid g union all select v_worker::regrole::oid where fn.worker_execute
      union all select current_user::regrole::oid where obj.proname='cancel_never_attempted') e;
    if actual is distinct from expected then raise exception 'Inventory maintenance: function ACL mismatch'; end if;
  end loop;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,a.attcollation::regcollation::text,pg_get_expr(d.adbin,d.adrelid)) order by c.relname,a.attnum) from pg_class c join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where c.relnamespace='tll_inventory_private'::regnamespace and c.relkind='r')::text,'UTF8')),'hex')) is distinct from '165d1dd4d11b6e33606e748644ac6b35c41edf39720445607e32db965142b1a8' then raise exception 'Inventory maintenance: canonical column structure mismatch'; end if;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,pg_get_constraintdef(k.oid,true)) order by c.relname,k.conname) from pg_constraint k join pg_class c on c.oid=k.conrelid where c.relnamespace='tll_inventory_private'::regnamespace)::text,'UTF8')),'hex')) is distinct from '8798505ef7e06944c143bd9d5dec5ffdc73410ef1ba1f9ac846e2b9547670d68' then raise exception 'Inventory maintenance: canonical constraint structure mismatch'; end if;
  if (select encode(sha256(convert_to((select jsonb_agg(jsonb_build_array(c.relname,pg_get_indexdef(i.indexrelid),i.indisvalid,i.indisready) order by c.relname) from pg_index i join pg_class c on c.oid=i.indexrelid where c.relnamespace='tll_inventory_private'::regnamespace)::text,'UTF8')),'hex')) is distinct from 'c17aa6a1f5127f8bd8700479d42cb05065fa1bd59148f55596a5c4b0c594b969' then raise exception 'Inventory maintenance: canonical index structure mismatch'; end if;
  foreach r in array array['anon','authenticated','service_role',v_worker] loop
    if has_schema_privilege(r,'tll_inventory_private','CREATE') or has_schema_privilege(r,'tll_inventory_private','USAGE') is distinct from (r=v_worker) then raise exception 'Inventory maintenance: effective schema authority mismatch'; end if;
    for obj in select oid from pg_class where relnamespace='tll_inventory_private'::regnamespace and relkind='r' loop
      if has_table_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inventory maintenance: effective table authority mismatch'; end if;
    end loop;
    for obj in select oid,proname from pg_proc where pronamespace='tll_inventory_private'::regnamespace loop
      if has_function_privilege(r,obj.oid,'EXECUTE') is distinct from (r=v_worker and obj.proname=any(array['enqueue','claim','begin_attempt','begin_reconciliation','finish_reconciliation','inspect_operation'])) then raise exception 'Inventory maintenance: effective function authority mismatch'; end if;
    end loop;
  end loop;
  if exists(select from pg_auth_members where roleid in('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole) or member in('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole)) or exists(select from pg_shdepend where refclassid='pg_authid'::regclass and refobjid in('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole)) then raise exception 'Inventory maintenance: retired role retains authority/dependency'; end if;
  if (select count(*) from pg_auth_members where roleid in(v_owner::regrole,v_worker::regrole))<>2 or exists(select from pg_auth_members where (roleid in(v_owner::regrole,v_worker::regrole) or member in(v_owner::regrole,v_worker::regrole)) and not(roleid in(v_owner::regrole,v_worker::regrole) and member=current_user::regrole and admin_option and not inherit_option and not set_option)) then raise exception 'Inventory maintenance: ADMIN-only installer authority required'; end if;
  if pg_has_role(current_user,v_owner,'USAGE') or pg_has_role(current_user,v_owner,'SET') or pg_has_role(current_user,v_worker,'USAGE') or pg_has_role(current_user,v_worker,'SET') then raise exception 'Inventory maintenance: installer retains effective runtime role'; end if;
end $postflight$;
commit;
