-- Staging-only anonymous cart reservations. No hosted enablement or gateway credential.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
do $$ declare marker jsonb; expected text:=current_setting('tll.cart_expected_project_ref',true);
begin
  if current_setting('tll.cart_migration_environment',true) is distinct from 'staging'
    or expected is null or expected !~ '^[a-z0-9]{20}$' or expected='wrhgscovsgsudtedbljr'
    or to_regclass('tll_staging_private.environment') is null then raise exception 'Explicit staging context required'; end if;
  execute 'select to_jsonb(e) from tll_staging_private.environment e where singleton' into marker;
  if marker->>'environment' is distinct from 'tll-hosted-staging-v1'
    or marker->>'operator_project_ref' is distinct from expected
    or marker->>'identity_basis' is distinct from 'explicit-operator-dashboard-binding' then raise exception 'Staging marker mismatch'; end if;
end $$;
do $$ declare migration_role name:=current_user; r text;
begin
  if current_setting('server_version_num')::integer<170000 then raise exception 'PostgreSQL 17 required'; end if;
  if to_regnamespace('tll_cart_private') is not null or exists(select 1 from pg_roles where rolname in ('tll_cart_owner','tll_cart_gateway','tll_cart_role_setup')) then
    raise exception 'Cart namespace or role collision; inspect migration history';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if not exists(select 1 from pg_roles where rolname=r) then raise exception 'Missing platform role'; end if;
  end loop;
  -- Preserve bootstrap ADMIN-only owner/gateway edges for deliberate trusted
  -- migrations and runtime provisioning, without default inherited/SET access.
  set local createrole_self_grant='';
  create role tll_cart_gateway nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
  create role tll_cart_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
  if (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant tll_cart_gateway to %I with admin true, inherit false, set false',migration_role);
    execute format('grant tll_cart_owner to %I with admin true, inherit false, set false',migration_role);
  end if;
  execute format('grant tll_cart_owner to %I with inherit false, set true',migration_role);
end $$;

create schema tll_cart_private;
revoke all on schema tll_cart_private from public,anon,authenticated,service_role,tll_cart_gateway;
grant usage on schema tll_cart_private to tll_cart_owner;
create table tll_cart_private.control (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false,
  operator_oid oid not null default current_user::regrole::oid
);
insert into tll_cart_private.control(singleton,enabled) values(true,false);
create table tll_cart_private.sessions (
  session_hash text primary key check(session_hash ~ '^[a-f0-9]{64}$'),
  actor_hash text not null check(actor_hash ~ '^[a-f0-9]{64}$'),
  revision bigint not null default 0 check(revision between 0 and 9007199254740991),
  phase text not null default 'ready' check(phase in ('ready','working','held')),
  envelope jsonb,
  quantity integer not null default 0 check(quantity between 0 and 5),
  unit_price_pence integer check(unit_price_pence between 1 and 99999999),
  subtotal_pence integer not null default 0 check(subtotal_pence between 0 and 499999995),
  operation_id uuid, lease_until timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp()+interval '24 hours',
  check((quantity=0 and subtotal_pence=0 and unit_price_pence is null) or (quantity>0 and unit_price_pence is not null and subtotal_pence=quantity*unit_price_pence)),
  check((phase='working')=(lease_until is not null))
);
create table tll_cart_private.operations (
  session_hash text not null references tll_cart_private.sessions(session_hash),
  request_id uuid not null, request_hash text not null check(request_hash ~ '^[a-f0-9]{64}$'),
  expected_revision bigint not null check(expected_revision>=0), target_quantity integer not null check(target_quantity between 0 and 5),
  state text not null default 'working' check(state in ('working','ready','held')),
  created_at timestamptz not null default clock_timestamp(), primary key(session_hash,request_id)
);
revoke all on all tables in schema tll_cart_private from public,anon,authenticated,service_role,tll_cart_gateway;
alter table tll_cart_private.control enable row level security;
alter table tll_cart_private.sessions enable row level security;
alter table tll_cart_private.operations enable row level security;
grant select on tll_cart_private.control to tll_cart_owner;
-- SELECT FOR SHARE requires UPDATE on at least one column. RLS permits the
-- locking read but rejects every actual control update by the function owner.
grant update(enabled) on tll_cart_private.control to tll_cart_owner;
grant select,insert,update on tll_cart_private.sessions,tll_cart_private.operations to tll_cart_owner;
create policy cart_control_owner on tll_cart_private.control for select to tll_cart_owner using(true);
create policy cart_control_lock on tll_cart_private.control for update to tll_cart_owner using(true) with check(false);
create policy cart_sessions_owner on tll_cart_private.sessions to tll_cart_owner using(true) with check(true);
create policy cart_operations_owner on tll_cart_private.operations to tll_cart_owner using(true) with check(true);

create function tll_cart_private.snapshot(s tll_cart_private.sessions) returns jsonb language sql immutable set search_path='' as $$
  select jsonb_build_object('sessionHash',s.session_hash,'actorHash',s.actor_hash,'revision',s.revision,'phase',s.phase,
    'envelope',s.envelope,'quantity',s.quantity,'unitPricePence',s.unit_price_pence,'subtotalPence',s.subtotal_pence,
    'operationId',s.operation_id,'expiresAt',s.expires_at)
$$;
-- Exact six-field authenticated envelope. No arbitrary JSON or raw cart ID storage.
create function tll_cart_private.valid_envelope(v jsonb) returns boolean language sql immutable set search_path='' as $$
  select jsonb_typeof(v)='object' and (select count(*) from jsonb_object_keys(v))=6
    and not exists(select from jsonb_object_keys(v) k where k<>all(array['v','alg','kid','iv','tag','ciphertext']))
    and v->'v'='1'::jsonb and v->>'alg'='A256GCM' and v->>'kid' ~ '^[A-Za-z0-9_-]{1,64}$'
    and v->>'iv' ~ '^[A-Za-z0-9_-]{16}$' and v->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
    and length(v->>'ciphertext') between 1 and 24000 and v->>'ciphertext' ~ '^[A-Za-z0-9_-]+$'
$$;

create function public.tll_cart_open(p_session text,p_actor text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s tll_cart_private.sessions%rowtype;
begin
  if p_session is null or p_session !~ '^[a-f0-9]{64}$' or p_actor is null or p_actor !~ '^[a-f0-9]{64}$' then raise exception 'Invalid cart context'; end if;
  perform pg_advisory_xact_lock(706006);
  -- Admit only after resource waits. Hold the shared control lock until COMMIT,
  -- so operator disable cannot acknowledge between admission and persistence.
  if not coalesce((select enabled from tll_cart_private.control where singleton for share),false) then raise exception 'Staging cart repository unavailable' using errcode='55000'; end if;
  select * into s from tll_cart_private.sessions where session_hash=p_session;
  if found then
    if s.actor_hash<>p_actor or s.expires_at<=clock_timestamp() then return null; end if;
    return tll_cart_private.snapshot(s);
  end if;
  -- This synthetic store is bounded. No automatic deletion hides unresolved carts.
  if (select count(*) from tll_cart_private.sessions)>=100 then raise exception 'Staging session limit reached'; end if;
  insert into tll_cart_private.sessions(session_hash,actor_hash) values(p_session,p_actor) returning * into s;
  return tll_cart_private.snapshot(s);
end $$;
create function public.tll_cart_read(p_session text,p_actor text) returns jsonb language plpgsql security definer set search_path='' as $$
declare s tll_cart_private.sessions%rowtype;
begin
  select * into s from tll_cart_private.sessions where session_hash=p_session and actor_hash=p_actor for update;
  if not coalesce((select enabled from tll_cart_private.control where singleton for share),false) then raise exception 'Staging cart repository unavailable' using errcode='55000'; end if;
  if s.session_hash is null or s.expires_at<=clock_timestamp() then return null; end if;
  if s.phase='working' and s.lease_until<=clock_timestamp() then
    update tll_cart_private.operations set state='held' where session_hash=p_session and request_id=s.operation_id and state='working';
    update tll_cart_private.sessions set phase='held',lease_until=null where session_hash=p_session returning * into s;
  end if;
  return tll_cart_private.snapshot(s);
end $$;
create function public.tll_cart_claim(p_session text,p_actor text,p_request uuid,p_hash text,p_revision bigint,p_quantity integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s tll_cart_private.sessions%rowtype; op tll_cart_private.operations%rowtype;
begin
  if p_request is null or p_hash is null or p_hash !~ '^[a-f0-9]{64}$' or p_revision is null or p_revision<0 or p_quantity is null or p_quantity not between 0 and 5 then raise exception 'Invalid cart operation'; end if;
  select * into s from tll_cart_private.sessions where session_hash=p_session and actor_hash=p_actor for update;
  if not coalesce((select enabled from tll_cart_private.control where singleton for share),false) then raise exception 'Staging cart repository unavailable' using errcode='55000'; end if;
  if s.session_hash is null or s.expires_at<=clock_timestamp() then return null; end if;
  select * into op from tll_cart_private.operations where session_hash=p_session and request_id=p_request;
  if found then
    return jsonb_build_object('status',case when op.request_hash=p_hash and op.target_quantity=p_quantity and op.expected_revision=p_revision then 'replay' else 'conflict' end,'record',tll_cart_private.snapshot(s));
  end if;
  if s.phase<>'ready' then return jsonb_build_object('status','held','record',tll_cart_private.snapshot(s)); end if;
  if s.revision<>p_revision then return jsonb_build_object('status','conflict','record',tll_cart_private.snapshot(s)); end if;
  if (select count(*) from tll_cart_private.operations where session_hash=p_session)>=100 then raise exception 'Staging operation limit reached'; end if;
  insert into tll_cart_private.operations(session_hash,request_id,request_hash,expected_revision,target_quantity) values(p_session,p_request,p_hash,p_revision,p_quantity);
  update tll_cart_private.sessions set phase='working',operation_id=p_request,lease_until=clock_timestamp()+interval '45 seconds' where session_hash=p_session returning * into s;
  return jsonb_build_object('status','claimed','record',tll_cart_private.snapshot(s));
end $$;
create function public.tll_cart_finish(p_session text,p_actor text,p_request uuid,p_state text,p_envelope jsonb,p_quantity integer,p_unit integer,p_subtotal integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare s tll_cart_private.sessions%rowtype; op tll_cart_private.operations%rowtype;
begin
  select * into s from tll_cart_private.sessions where session_hash=p_session and actor_hash=p_actor for update;
  if not coalesce((select enabled from tll_cart_private.control where singleton for share),false) then raise exception 'Staging cart repository unavailable' using errcode='55000'; end if;
  if s.session_hash is null or s.expires_at<=clock_timestamp() then return null; end if;
  if s.phase<>'working' or s.operation_id is distinct from p_request then return tll_cart_private.snapshot(s); end if;
  if p_state is null or p_state not in ('ready','held') then raise exception 'Invalid cart outcome'; end if;
  select * into strict op from tll_cart_private.operations where session_hash=p_session and request_id=p_request;
  if p_state='ready' then
    if s.lease_until<=clock_timestamp() then p_state:='held';
    elsif p_quantity is distinct from op.target_quantity or p_quantity not between 0 and 5
      or (p_quantity=0 and (p_unit is not null or p_subtotal is distinct from 0))
      or (p_quantity>0 and (p_unit is null or p_unit<=0 or p_subtotal is distinct from p_unit*p_quantity))
      or (p_envelope is null and (p_quantity<>0 or s.envelope is not null))
      or (p_envelope is not null and tll_cart_private.valid_envelope(p_envelope) is not true) then raise exception 'Invalid cart projection'; end if;
  end if;
  if p_state='ready' then
    update tll_cart_private.sessions set revision=revision+1,phase='ready',lease_until=null,envelope=p_envelope,
      quantity=p_quantity,unit_price_pence=p_unit,subtotal_pence=p_subtotal where session_hash=p_session returning * into s;
  else
    -- Preserve previous encrypted ID and projection. Uncertain outcomes cannot
    -- replace the known cart or silently reopen the session for another create.
    update tll_cart_private.sessions set phase='held',lease_until=null where session_hash=p_session returning * into s;
  end if;
  update tll_cart_private.operations set state=p_state where session_hash=p_session and request_id=p_request;
  return tll_cart_private.snapshot(s);
end $$;

revoke all on all functions in schema tll_cart_private from public,anon,authenticated,service_role,tll_cart_gateway;
grant execute on all functions in schema tll_cart_private to tll_cart_owner;
revoke all on function public.tll_cart_open(text,text),public.tll_cart_read(text,text),public.tll_cart_claim(text,text,uuid,text,bigint,integer),public.tll_cart_finish(text,text,uuid,text,jsonb,integer,integer,integer) from public,anon,authenticated,service_role,tll_cart_gateway;
grant usage on schema public to tll_cart_gateway;
grant execute on function public.tll_cart_open(text,text),public.tll_cart_read(text,text),public.tll_cart_claim(text,text,uuid,text,bigint,integer),public.tll_cart_finish(text,text,uuid,text,jsonb,integer,integer,integer) to tll_cart_gateway;
grant create on schema public,tll_cart_private to tll_cart_owner;
do $$ declare fn record;
begin
  for fn in select p.oid::regprocedure as signature from pg_proc p where p.pronamespace='tll_cart_private'::regnamespace
    or (p.pronamespace='public'::regnamespace and p.proname in ('tll_cart_open','tll_cart_read','tll_cart_claim','tll_cart_finish')) loop
    execute format('alter function %s owner to tll_cart_owner',fn.signature);
  end loop;
end $$;
revoke create on schema public,tll_cart_private from tll_cart_owner;
do $$ declare migration_role name:=current_user;
begin
  if (select rolsuper from pg_roles where rolname=current_user) then
    execute format('grant tll_cart_owner to %I with admin true, inherit false, set false',migration_role);
  else
    execute format('revoke tll_cart_owner from %I granted by %I',migration_role,migration_role);
  end if;
end $$;
do $$ declare r text; fn record; acl record; tbl record;
begin
  -- Reject unexpected inherited default ACL grants rather than silently accepting
  -- an additional runtime principal on these new private objects.
  for fn in select p.* from pg_proc p where p.pronamespace='tll_cart_private'::regnamespace
    or (p.pronamespace='public'::regnamespace and p.proname in ('tll_cart_open','tll_cart_read','tll_cart_claim','tll_cart_finish')) loop
    if fn.proowner<>'tll_cart_owner'::regrole then raise exception 'Unexpected cart function owner'; end if;
    for acl in select * from aclexplode(coalesce(fn.proacl,acldefault('f',fn.proowner))) loop
      if acl.grantee<>'tll_cart_owner'::regrole and not (fn.pronamespace='public'::regnamespace and acl.grantee='tll_cart_gateway'::regrole and acl.privilege_type='EXECUTE' and not acl.is_grantable) then
        raise exception 'Unexpected cart function ACL';
      end if;
    end loop;
  end loop;
  for tbl in select * from pg_class where relnamespace='tll_cart_private'::regnamespace and relkind='r' loop
    if tbl.relowner<>current_user::regrole or not tbl.relrowsecurity then raise exception 'Unexpected cart table owner or RLS'; end if;
    for acl in select * from aclexplode(coalesce(tbl.relacl,acldefault('r',tbl.relowner))) loop
      if acl.grantee<>current_user::regrole and acl.grantee<>'tll_cart_owner'::regrole then raise exception 'Unexpected cart table ACL'; end if;
    end loop;
  end loop;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_schema_privilege(r,'tll_cart_private','USAGE,CREATE') or pg_has_role(r,'tll_cart_owner','MEMBER') or pg_has_role(r,'tll_cart_gateway','MEMBER') then raise exception 'Client cart authority leak'; end if;
    for fn in select p.oid from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in ('tll_cart_open','tll_cart_read','tll_cart_claim','tll_cart_finish') loop
      if has_function_privilege(r,fn.oid,'EXECUTE') then raise exception 'Cart RPC authority leak'; end if;
    end loop;
  end loop;
  if (select operator_oid from tll_cart_private.control where singleton)<>current_user::regrole then raise exception 'Cart operator mismatch'; end if;
  if (select count(*) from pg_auth_members where roleid='tll_cart_gateway'::regrole and member=current_user::regrole)<>1
    or (select count(*) from pg_auth_members where roleid='tll_cart_owner'::regrole and member=current_user::regrole)<>1 then raise exception 'Missing or duplicate scoped cart administration'; end if;
  if exists(select from pg_auth_members where (roleid in ('tll_cart_owner'::regrole,'tll_cart_gateway'::regrole) or member in ('tll_cart_owner'::regrole,'tll_cart_gateway'::regrole))
    and not (roleid in ('tll_cart_owner'::regrole,'tll_cart_gateway'::regrole) and member=current_user::regrole and admin_option and not inherit_option and not set_option
      and (select rolsuper from pg_roles where oid=grantor))) then raise exception 'Unexpected cart role membership'; end if;
  if not (select rolsuper from pg_roles where rolname=current_user) and
    (pg_has_role(current_user,'tll_cart_gateway','USAGE') or pg_has_role(current_user,'tll_cart_gateway','SET')
     or pg_has_role(current_user,'tll_cart_owner','USAGE') or pg_has_role(current_user,'tll_cart_owner','SET')) then raise exception 'Operator has effective cart role authority'; end if;
end $$;
commit;
