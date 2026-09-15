-- F21. No credentials or production activation in this migration.
-- The approved server deploy and secret provisioning must accompany release.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$
declare t text; expected text[]; actual text[]; migration_role name:=current_user;
begin
  if not exists (select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions') then
    raise exception 'Prerequisite: pgcrypto installed in extensions schema';
  end if;
  foreach t in array array['contact_submissions','supplement_submissions'] loop
    if to_regclass('public.'||t) is null then raise exception 'Missing submission inbox %',t; end if;
    expected := case t when 'contact_submissions' then array['id:uuid','name:text','email:text','message:text','created_at:timestamp with time zone']
      else array['id:uuid','category:text','brand:text','product_name:text','url:text','notes:text','email:text','created_at:timestamp with time zone'] end;
    select array_agg(attname||':'||format_type(atttypid,atttypmod) order by attnum) into actual from pg_attribute
      where attrelid=to_regclass('public.'||t) and attnum>0 and not attisdropped;
    if actual is distinct from expected then raise exception 'Submission schema drift: %',t; end if;
  end loop;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then raise exception 'Elevated client role'; end if;
  if exists(select 1 from pg_roles where rolname='tll_submission_role_setup') then raise exception 'Temporary gateway role name collides'; end if;
  if exists(select 1 from pg_roles where rolname='tll_submission_owner') then
    if exists(select 1 from pg_roles where rolname='tll_submission_owner' and (rolcanlogin or rolsuper or rolbypassrls or rolcreaterole or rolcreatedb or rolreplication or rolinherit))
       or exists(select 1 from pg_auth_members where roleid='tll_submission_owner'::regrole or member='tll_submission_owner'::regrole) then
      raise exception 'Unexpected gateway owner role configuration';
    end if;
  else
    if current_setting('server_version_num')::integer>=160000 and not (select rolsuper from pg_roles where rolname=current_user) then
      -- PG16+ gives a non-superuser creator ADMIN membership granted by the
      -- bootstrap superuser. That creator cannot revoke the automatic grant.
      -- A transaction-only helper creates the owner; dropping the helper after
      -- transfer removes its automatic membership without persistent authority.
      create role tll_submission_role_setup nologin nosuperuser nobypassrls createrole nocreatedb noreplication noinherit;
      execute format('grant tll_submission_role_setup to %I with inherit false, set true',migration_role);
      set local role tll_submission_role_setup;
      create role tll_submission_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
      execute format('grant tll_submission_owner to %I with inherit false, set true',migration_role);
      execute format('set local role %I',migration_role);
    else
      create role tll_submission_owner nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication noinherit;
    end if;
  end if;
  if to_regnamespace('tll_submission_private') is not null or to_regprocedure('public.submit_public_form(text,text,text)') is not null then
    raise exception 'Gateway already exists or schema name collides; inspect migration history';
  end if;
end $$;

-- Remove cumulative table AND column grants. Unknown inherited authority fails
-- preflight below instead of silently changing a shared staff role's grants.
do $$
declare t text; columns text; p record; remaining_roles text;
begin
  foreach t in array array['contact_submissions','supplement_submissions'] loop
    execute format('revoke all on public.%I from public, anon, authenticated',t);
    select string_agg(quote_ident(attname),',') into columns from pg_attribute where attrelid=to_regclass('public.'||t) and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public, anon, authenticated',columns,t);
    if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
       or has_any_column_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,REFERENCES')
       or has_any_column_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then
      raise exception 'Inherited inbox privileges remain on %; resolve shared-role grants explicitly',t;
    end if;
    -- Preserve explicitly named non-client staff/service policy roles and their predicates.
    for p in select * from pg_policy where polrelid=to_regclass('public.'||t) loop
      if exists(select 1 from unnest(p.polroles) r where case when r=0 then true else pg_has_role('anon',r,'USAGE') or pg_has_role('authenticated',r,'USAGE') end) then
        select string_agg(quote_ident(rolname),',') into remaining_roles from pg_roles where oid=any(p.polroles)
          and not pg_has_role('anon',oid,'USAGE') and not pg_has_role('authenticated',oid,'USAGE');
        if remaining_roles is null then execute format('drop policy %I on public.%I',p.polname,t);
        else execute format('alter policy %I on public.%I to %s',p.polname,t,remaining_roles); end if;
      end if;
    end loop;
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create schema tll_submission_private;
revoke all on schema tll_submission_private from public, anon, authenticated;
grant usage on schema tll_submission_private, public, extensions to tll_submission_owner;

create table tll_submission_private.policy (
  singleton boolean primary key default true check(singleton),
  enabled boolean not null default false,
  audience text check(audience ~ '^tll-submissions:[a-z0-9_-]{1,64}$'),
  ip_burst_limit integer not null default 3 check(ip_burst_limit between 1 and 100),
  ip_daily_limit integer not null default 10 check(ip_daily_limit between 1 and 1000),
  email_daily_limit integer not null default 5 check(email_daily_limit between 1 and 100),
  global_hourly_limit integer not null default 100 check(global_hourly_limit between 1 and 10000),
  global_daily_limit integer not null default 500 check(global_daily_limit between 1 and 100000)
);
insert into tll_submission_private.policy(singleton) values(true);
create table tll_submission_private.signing_keys (
  key_id text primary key check(key_id ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  secret bytea not null check(octet_length(secret)=32),
  valid_from timestamptz not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  check(expires_at>valid_from and expires_at<=valid_from+interval '30 days')
);
create table tll_submission_private.quota (
  scope text not null, subject text not null, window_start bigint not null,
  used integer not null check(used>0), expires_at timestamptz not null,
  primary key(scope,subject,window_start)
);
create index quota_expiry on tll_submission_private.quota(expires_at);
create table tll_submission_private.receipts (
  request_id uuid primary key, binding_digest bytea not null,
  created_at timestamptz not null default now(), expires_at timestamptz not null
);
create index receipt_expiry on tll_submission_private.receipts(expires_at);
revoke all on all tables in schema tll_submission_private from public, anon, authenticated;
grant select on tll_submission_private.policy,tll_submission_private.signing_keys to tll_submission_owner;
grant select,insert,update,delete on tll_submission_private.quota to tll_submission_owner;
grant select,insert,delete on tll_submission_private.receipts to tll_submission_owner;
grant insert(id,name,email,message) on public.contact_submissions to tll_submission_owner;
grant insert(id,category,brand,product_name,url,notes,email) on public.supplement_submissions to tll_submission_owner;
create policy submission_gateway_contact on public.contact_submissions for insert to tll_submission_owner with check(true);
create policy submission_gateway_supplement on public.supplement_submissions for insert to tll_submission_owner with check(true);

create function tll_submission_private.valid_body(p_kind text,p_body jsonb)
returns boolean language plpgsql immutable security invoker set search_path='' as $body$
declare names text[]; k text; v text; maximum integer;
begin
  if jsonb_typeof(p_body) is distinct from 'object' then return false; end if;
  names:=case p_kind when 'contact' then array['name','email','message'] when 'supplement' then array['category','brand','product','url','notes','email'] else null end;
  if names is null or (select count(*) from jsonb_object_keys(p_body))<>cardinality(names) or exists(select 1 from jsonb_object_keys(p_body) as keys(key) where not keys.key=any(names)) then return false; end if;
  foreach k in array names loop
    if jsonb_typeof(p_body->k) is distinct from 'string' then return false; end if;
    v:=p_body->>k;
    maximum:=case k when 'name' then 120 when 'email' then 254 when 'message' then 8000 when 'brand' then 120 when 'product' then 200 when 'url' then 2048 when 'notes' then 4000 else 40 end;
    if char_length(v)>maximum or v<>btrim(v) or ((p_kind='contact' or k not in ('email','notes')) and char_length(v)=0) then return false; end if;
    if (case when k in ('notes','message') then translate(v,E'\r\n\t','') else v end) ~ '[[:cntrl:]]' then return false; end if;
  end loop;
  if p_body->>'email'<>'' and p_body->>'email' !~ $re$^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$$re$ then return false; end if;
  if p_kind='supplement' then
    if not (p_body->>'category'=any(array['whey','whey-isolate','casein','creatine','pre-workout','eaas','intra-workout','post-workout','hydration','cycle-support','protein-bar','meal-replacement','vitamin','multivitamin','vitamin-d','zma','hormone-support','gut-digestion','heart-health','liver-health','omega-3','joint-health','vitamin-c','magnesium','sleep-recovery'])) then return false; end if;
    if p_body->>'url' !~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+/[^#[:space:]]*$' then return false; end if;
  end if;
  return true;
end $body$;
revoke all on function tll_submission_private.valid_body(text,jsonb) from public,anon,authenticated;
grant execute on function tll_submission_private.valid_body(text,jsonb) to tll_submission_owner;

create function public.submit_public_form(p_key_id text,p_payload text,p_signature text)
returns jsonb language plpgsql security definer set search_path='' set lock_timeout='2s' as $$
declare
  v_now timestamptz:=clock_timestamp(); v_epoch bigint; v_key tll_submission_private.signing_keys%rowtype;
  v_policy tll_submission_private.policy%rowtype; v jsonb; b jsonb; v_issued bigint; v_request uuid;
  v_expected bytea; v_blind bytea; v_binding bytea; v_previous bytea;
  v_scope text; v_subject text; v_period integer; v_limit integer; v_start bigint; v_used integer;
  v_scopes text[]:=array['global_hour','global_day','ip_burst','ip_day','email_day']; v_retry integer:=0;
begin
  if p_key_id is null or p_key_id !~ '^[a-z0-9][a-z0-9_-]{0,63}$' or p_payload is null or octet_length(p_payload)>40000
    or p_signature is null or p_signature !~ '^[0-9a-f]{64}$' then return jsonb_build_object('status','rejected'); end if;
  select * into v_key from tll_submission_private.signing_keys where key_id=p_key_id and not revoked and valid_from<=v_now and expires_at>v_now;
  if not found then return jsonb_build_object('status','rejected'); end if;
  v_expected:=extensions.hmac(convert_to(p_payload,'UTF8'),v_key.secret,'sha256');
  -- A fresh random blinding key prevents equality timing from disclosing a stable
  -- MAC prefix. No user-provided signature is compared directly with the secret MAC.
  v_blind:=extensions.gen_random_bytes(32);
  if extensions.hmac(v_expected,v_blind,'sha256')<>extensions.hmac(decode(p_signature,'hex'),v_blind,'sha256') then return jsonb_build_object('status','rejected'); end if;
  begin v:=p_payload::jsonb; exception when others then return jsonb_build_object('status','invalid'); end;
  if jsonb_typeof(v) is distinct from 'object' then return jsonb_build_object('status','invalid'); end if;
  if (select count(*) from jsonb_object_keys(v))<>9
    or exists(select 1 from jsonb_object_keys(v) k where k not in ('version','audience','kind','issued_at','request_id','ip_subject','email_subject','body_sha256','body_json'))
    or v->'version' is distinct from '1'::jsonb or jsonb_typeof(v->'issued_at') is distinct from 'number'
    or v->>'issued_at' !~ '^[0-9]{1,10}$' then return jsonb_build_object('status','invalid'); end if;
  if exists(select 1 from unnest(array['audience','kind','request_id','ip_subject','email_subject','body_sha256','body_json']) k where jsonb_typeof(v->k) is distinct from 'string') then return jsonb_build_object('status','invalid'); end if;
  v_epoch:=floor(extract(epoch from v_now)); v_issued:=(v->>'issued_at')::bigint;
  if v_issued<v_epoch-300 or v_issued>v_epoch+30 or to_timestamp(v_issued)<v_key.valid_from or to_timestamp(v_issued)>=v_key.expires_at then return jsonb_build_object('status','rejected'); end if;
  select * into v_policy from tll_submission_private.policy where singleton;
  if not found or not v_policy.enabled or v_policy.audience is null then return jsonb_build_object('status','unavailable'); end if;
  if v->>'audience' is distinct from v_policy.audience then return jsonb_build_object('status','rejected'); end if;
  if v->>'kind' not in ('contact','supplement') or v->>'request_id' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or v->>'ip_subject' !~ '^[0-9a-f]{64}$' or v->>'email_subject' !~ '^([0-9a-f]{64})?$'
    or octet_length(v->>'body_json')>16384 or v->>'body_sha256' is distinct from encode(extensions.digest(convert_to(v->>'body_json','UTF8'),'sha256'),'hex') then
    return jsonb_build_object('status','invalid'); end if;
  begin b:=(v->>'body_json')::jsonb; exception when others then return jsonb_build_object('status','invalid'); end;
  if not tll_submission_private.valid_body(v->>'kind',b) or ((b->>'email'='') is distinct from (v->>'email_subject'='')) then return jsonb_build_object('status','invalid'); end if;
  v_request:=(v->>'request_id')::uuid;
  v_binding:=extensions.digest(convert_to((v->>'audience')||E'\n'||(v->>'kind')||E'\n'||(v->>'body_sha256')||E'\n'||(v->>'ip_subject')||E'\n'||(v->>'email_subject'),'UTF8'),'sha256');
  -- One short transaction lock serializes the low-volume global cap, every quota
  -- and idempotency. No process-local state or check-then-insert race exists.
  perform pg_advisory_xact_lock(742110021);
  select binding_digest into v_previous from tll_submission_private.receipts where request_id=v_request and expires_at>v_now;
  if found then
    return jsonb_build_object('status',case when v_previous=v_binding then 'duplicate' else 'conflict' end);
  end if;
  foreach v_scope in array v_scopes loop
    v_subject:=case when v_scope like 'global_%' then 'all' when v_scope like 'ip_%' then v->>'ip_subject' else v->>'email_subject' end;
    if v_subject='' then continue; end if;
    v_period:=case v_scope when 'global_hour' then 3600 when 'ip_burst' then 600 else 86400 end;
    v_limit:=case v_scope when 'global_hour' then v_policy.global_hourly_limit when 'global_day' then v_policy.global_daily_limit when 'ip_burst' then v_policy.ip_burst_limit when 'ip_day' then v_policy.ip_daily_limit else v_policy.email_daily_limit end;
    v_start:=(v_epoch/v_period)*v_period;
    select used into v_used from tll_submission_private.quota where scope=v_scope and subject=v_subject and window_start=v_start;
    if coalesce(v_used,0)>=v_limit then v_retry:=greatest(v_retry,(v_start+v_period-v_epoch)::integer); end if;
  end loop;
  if v_retry>0 then return jsonb_build_object('status','rate_limited','retry_after_seconds',v_retry); end if;
  -- Bounded opportunistic cleanup. Historical inbox data is never deleted here.
  delete from tll_submission_private.quota where ctid in (select ctid from tll_submission_private.quota where expires_at<=v_now order by expires_at limit 1000);
  delete from tll_submission_private.receipts where request_id in (select request_id from tll_submission_private.receipts where expires_at<=v_now order by expires_at limit 1000);
  foreach v_scope in array v_scopes loop
    v_subject:=case when v_scope like 'global_%' then 'all' when v_scope like 'ip_%' then v->>'ip_subject' else v->>'email_subject' end;
    if v_subject='' then continue; end if;
    v_period:=case v_scope when 'global_hour' then 3600 when 'ip_burst' then 600 else 86400 end;
    v_start:=(v_epoch/v_period)*v_period;
    insert into tll_submission_private.quota(scope,subject,window_start,used,expires_at) values(v_scope,v_subject,v_start,1,to_timestamp(v_start+v_period)+interval '1 day')
      on conflict(scope,subject,window_start) do update set used=tll_submission_private.quota.used+1;
  end loop;
  if v->>'kind'='contact' then
    insert into public.contact_submissions(id,name,email,message) values(v_request,b->>'name',b->>'email',b->>'message');
  else
    insert into public.supplement_submissions(id,category,brand,product_name,url,notes,email) values(v_request,b->>'category',b->>'brand',b->>'product',b->>'url',nullif(b->>'notes',''),nullif(b->>'email',''));
  end if;
  insert into tll_submission_private.receipts(request_id,binding_digest,expires_at) values(v_request,v_binding,v_now+interval '72 hours');
  return jsonb_build_object('status','accepted');
end $$;
-- Set final RPC ACLs while the migration role still owns the function.
revoke all on function public.submit_public_form(text,text,text) from public,anon,authenticated;
grant execute on function public.submit_public_form(text,text,text) to anon,authenticated;
-- Hosted Supabase's migration role is not a superuser. Ownership transfer needs
-- SET ROLE authority and CREATE for the new owner, only within this transaction.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='tll_submission_role_setup') then
    if current_setting('server_version_num')::integer>=160000 then
      execute format('grant tll_submission_owner to %I with inherit false, set true',current_user);
    else
      execute format('grant tll_submission_owner to %I',current_user);
    end if;
  end if;
end $$;
grant create on schema public to tll_submission_owner;
alter function public.submit_public_form(text,text,text) owner to tll_submission_owner;
revoke create on schema public from tll_submission_owner;
do $$
declare migration_role name:=current_user;
begin
  if exists(select 1 from pg_roles where rolname='tll_submission_role_setup') then
    set local role tll_submission_role_setup;
    execute format('revoke tll_submission_owner from %I',migration_role);
    execute format('set local role %I',migration_role);
    drop role tll_submission_role_setup;
  else
    execute format('revoke tll_submission_owner from %I',migration_role);
  end if;
end $$;
-- Default ACLs can grant NEW objects to a role inherited by browser users.
-- Check effective authority after all new objects exist, not only named ACLs.
do $$
declare browser_role text; object record;
begin
  foreach browser_role in array array['anon','authenticated'] loop
    if has_schema_privilege(browser_role,'tll_submission_private','USAGE,CREATE') then
      raise exception 'Private gateway privileges inherited by %; inspect schema default ACLs',browser_role;
    end if;
    for object in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='tll_submission_private' and c.relkind in ('r','p','v','m','f') loop
      if has_table_privilege(browser_role,object.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(browser_role,object.oid,'SELECT,INSERT,UPDATE,REFERENCES') then
        raise exception 'Private gateway privileges inherited by %; inspect table default ACLs',browser_role;
      end if;
    end loop;
    for object in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='tll_submission_private' loop
      if has_function_privilege(browser_role,object.oid,'EXECUTE') then raise exception 'Private gateway privileges inherited by %; inspect function default ACLs',browser_role; end if;
    end loop;
  end loop;
  if exists(select 1 from pg_roles where rolname='tll_submission_role_setup') or has_schema_privilege('tll_submission_owner','public','CREATE') or exists(select 1 from pg_auth_members where roleid='tll_submission_owner'::regrole or member='tll_submission_owner'::regrole) then
    raise exception 'Temporary ownership-transfer authority remains';
  end if;
end $$;
-- No service-role dependency, broad secret access, owner changes to legacy objects,
-- credentials, key provisioning, quota activation or grants back to public inboxes.
notify pgrst,'reload schema';
commit;
