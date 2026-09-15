-- Durable inventory-operation foundation. No hosted activation or worker login.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';

do $$ declare migration_role name:=current_user; r text;
begin
  if current_setting('server_version_num')::integer<170000 then raise exception 'PostgreSQL 17 required'; end if;
  if to_regnamespace('tll_inventory_private') is not null or exists(select 1 from pg_roles where rolname in ('tll_inventory_owner','tll_inventory_worker','tll_inventory_role_setup')) then
    raise exception 'Inventory namespace or role collision; inspect migration history';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from pg_roles where rolname=r) then raise exception 'Missing platform role'; end if;
  end loop;
  if not (select rolsuper from pg_roles where rolname=current_user) then
    -- PG17 automatically gives a non-superuser creator ADMIN membership. A
    -- transaction-only creator is dropped after transfer, removing that grant.
    create role tll_inventory_role_setup nologin nosuperuser nobypassrls createrole nocreatedb noreplication noinherit;
    execute format('grant tll_inventory_role_setup to %I with inherit false, set true',migration_role);
    set local role tll_inventory_role_setup;
  end if;
  create role tll_inventory_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
  create role tll_inventory_worker nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
  execute format('grant tll_inventory_owner to %I with inherit false, set true',migration_role);
  execute format('grant tll_inventory_worker to %I with inherit false, set true',migration_role);
  execute format('set local role %I',migration_role);
end $$;

create schema tll_inventory_private;
revoke all on schema tll_inventory_private from public,anon,authenticated,service_role;
grant usage on schema tll_inventory_private to tll_inventory_owner,tll_inventory_worker;

create table tll_inventory_private.control (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false
);
insert into tll_inventory_private.control(singleton) values(true);
create table tll_inventory_private.operations (
  operation_id uuid primary key,
  manifest_document text not null check(octet_length(manifest_document)<=32768),
  manifest_sha256 text not null check(manifest_sha256 ~ '^[0-9a-f]{64}$'),
  request_document text not null,
  request_hash text not null check(request_hash ~ '^[0-9a-f]{64}$'),
  shop_domain text not null,
  shop_id text not null,
  inventory_item_id text not null,
  location_id text not null,
  expected_available integer not null,
  desired_available integer not null check(desired_available>=0),
  binding_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  state text not null default 'queued' check(state in ('queued','claimed','attempted','reconciling','held','completed','cancelled')),
  fence bigint not null default 0 check(fence between 0 and 9007199254740991),
  worker_id uuid,
  lease_until timestamptz,
  attempted_at timestamptz,
  attempt_fence bigint,
  outcome text check(outcome in ('acknowledged','unknown','rejected')),
  adjustment_group_id text,
  acknowledgement_fence bigint,
  reconcile_token uuid,
  reconcile_started_at timestamptz,
  last_observation jsonb,
  hold_reason text,
  finished_at timestamptz,
  check((state in ('queued','held','completed','cancelled')) = (worker_id is null and lease_until is null)),
  check((attempted_at is null)=(attempt_fence is null)),
  check((adjustment_group_id is null)=(acknowledgement_fence is null))
);
-- HELD remains outstanding. Uncertainty cannot be bypassed with a new job/key.
create unique index inventory_one_outstanding_target on tll_inventory_private.operations(shop_id,inventory_item_id,location_id)
  where state not in ('completed','cancelled');
create table tll_inventory_private.events (
  event_id uuid primary key default gen_random_uuid(),
  operation_id uuid not null references tll_inventory_private.operations(operation_id),
  event_name text not null,
  fence bigint not null,
  worker_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
revoke all on all tables in schema tll_inventory_private from public,anon,authenticated,service_role,tll_inventory_worker;
alter table tll_inventory_private.control enable row level security;
alter table tll_inventory_private.operations enable row level security;
alter table tll_inventory_private.events enable row level security;
grant select on tll_inventory_private.control to tll_inventory_owner;
grant select,insert,update on tll_inventory_private.operations to tll_inventory_owner;
grant select,insert on tll_inventory_private.events to tll_inventory_owner;
create policy inventory_control_read on tll_inventory_private.control for select to tll_inventory_owner using(true);
create policy inventory_operations_owner on tll_inventory_private.operations to tll_inventory_owner using(true) with check(true);
create policy inventory_events_read on tll_inventory_private.events for select to tll_inventory_owner using(true);
create policy inventory_events_insert on tll_inventory_private.events for insert to tll_inventory_owner with check(true);

create function tll_inventory_private.immutable_operation() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' or row(new.operation_id,new.manifest_document,new.manifest_sha256,new.request_document,new.request_hash,new.shop_domain,new.shop_id,new.inventory_item_id,new.location_id,new.expected_available,new.desired_available,new.binding_hash,new.expires_at,new.created_at)
    is distinct from row(old.operation_id,old.manifest_document,old.manifest_sha256,old.request_document,old.request_hash,old.shop_domain,old.shop_id,old.inventory_item_id,old.location_id,old.expected_available,old.desired_available,old.binding_hash,old.expires_at,old.created_at) then
    raise exception 'Immutable inventory operation' using errcode='23514';
  end if;
  return new;
end $$;
create trigger immutable_inventory_operation before update or delete on tll_inventory_private.operations for each row execute function tll_inventory_private.immutable_operation();
create function tll_inventory_private.immutable_event() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'Append-only inventory events' using errcode='23514'; end $$;
create trigger immutable_inventory_event before update or delete on tll_inventory_private.events for each row execute function tll_inventory_private.immutable_event();

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
-- Only a trusted database operator may release never-attempted work for a new
-- reviewed plan. There is deliberately no automatic release of possibly sent work.
create function tll_inventory_private.cancel_never_attempted(p_id uuid,p_evidence_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare op tll_inventory_private.operations%rowtype;
begin
  select * into op from tll_inventory_private.operations where operation_id=p_id for update;
  if not found or op.state<>'held' or op.attempted_at is not null or p_evidence_id is null then return jsonb_build_object('status','unavailable'); end if;
  update tll_inventory_private.operations set state='cancelled',finished_at=clock_timestamp() where operation_id=p_id;
  insert into tll_inventory_private.events(operation_id,event_name,fence) values(p_id,'operator_cancelled_never_attempted:'||p_evidence_id,op.fence);
  return jsonb_build_object('status','cancelled');
end $$;

revoke all on all functions in schema tll_inventory_private from public,anon,authenticated,service_role,tll_inventory_worker;
grant execute on all functions in schema tll_inventory_private to tll_inventory_owner;
grant execute on function tll_inventory_private.enqueue(text),tll_inventory_private.claim(uuid,uuid,integer),tll_inventory_private.begin_attempt(uuid,uuid,bigint,text),tll_inventory_private.begin_reconciliation(uuid,uuid,bigint,text,text),tll_inventory_private.finish_reconciliation(uuid,uuid,bigint,uuid,text,jsonb),tll_inventory_private.inspect_operation(uuid) to tll_inventory_worker;
-- Preserve operator access for the migration role, without giving the worker
-- configuration writes, direct table access or a way to forge terminal recovery.
grant create on schema tll_inventory_private to tll_inventory_owner;
do $$ declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p where p.pronamespace='tll_inventory_private'::regnamespace loop
    execute format('alter function %s owner to tll_inventory_owner',fn.signature);
  end loop;
end $$;
revoke create on schema tll_inventory_private from tll_inventory_owner;
-- Grant after ownership transfer: PostgreSQL rewrites the former owner's own
-- ACL entry during ALTER OWNER, so a grant made before transfer would disappear.
do $$ declare migration_role name:=current_user;
begin
  set local role tll_inventory_owner;
  execute format('grant execute on function tll_inventory_private.cancel_never_attempted(uuid,uuid) to %I',migration_role);
  execute format('set local role %I',migration_role);
end $$;
do $$ declare migration_role name:=current_user; r text;
begin
  if exists(select 1 from pg_roles where rolname='tll_inventory_role_setup') then set local role tll_inventory_role_setup; end if;
  execute format('revoke tll_inventory_owner from %I',migration_role);
  execute format('revoke tll_inventory_worker from %I',migration_role);
  execute format('set local role %I',migration_role);
  if exists(select 1 from pg_roles where rolname='tll_inventory_role_setup') then drop role tll_inventory_role_setup; end if;
end $$;
do $$ declare r text; obj record;
begin
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_schema_privilege(r,'tll_inventory_private','USAGE,CREATE') or pg_has_role(r,'tll_inventory_owner','MEMBER') or pg_has_role(r,'tll_inventory_worker','MEMBER') then raise exception 'Inventory authority inherited by platform client role'; end if;
    for obj in select c.oid from pg_class c where c.relnamespace='tll_inventory_private'::regnamespace and c.relkind in ('r','p') loop
      if has_table_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') or has_any_column_privilege(r,obj.oid,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inventory table authority inherited by platform client role'; end if;
    end loop;
    for obj in select p.oid from pg_proc p where p.pronamespace='tll_inventory_private'::regnamespace loop
      if has_function_privilege(r,obj.oid,'EXECUTE') then raise exception 'Inventory function authority inherited by platform client role'; end if;
    end loop;
  end loop;
  if exists(select 1 from pg_auth_members where roleid in ('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole) or member in ('tll_inventory_owner'::regrole,'tll_inventory_worker'::regrole))
    or has_schema_privilege('tll_inventory_owner','tll_inventory_private','CREATE') then raise exception 'Inventory role authority retained'; end if;
end $$;
commit;
