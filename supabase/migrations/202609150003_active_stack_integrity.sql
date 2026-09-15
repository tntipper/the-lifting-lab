-- F09: deploy with the stack API/client protocol; no hosted application here.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
lock table public.user_stacks,public.stack_products in access exclusive mode;
do $$
declare t text; expected text[]; actual text[];
begin
  if to_regnamespace('tll_stack_private') is not null or to_regprocedure('public.get_active_stack()') is not null then raise exception 'Stack migration exists or name collides; inspect migration history'; end if;
  foreach t in array array['user_stacks','stack_products'] loop
    expected:=case t when 'user_stacks' then array['id:uuid','user_id:uuid','name:text','is_active:boolean','created_at:timestamp with time zone','updated_at:timestamp with time zone']
      else array['id:uuid','stack_id:uuid','product_id:uuid','servings_per_day:numeric','added_at:timestamp with time zone'] end;
    select array_agg(attname||':'||format_type(atttypid,atttypmod) order by attnum) into actual from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    if actual is distinct from expected then raise exception 'Stack schema drift: %',t; end if;
  end loop;
  if not exists(select 1 from pg_extension e join pg_namespace n on n.oid=e.extnamespace where e.extname='pgcrypto' and n.nspname='extensions') then raise exception 'pgcrypto in extensions is required'; end if;
  if exists(select 1 from public.user_stacks where user_id is null) or exists(select 1 from public.stack_products where stack_id is null or product_id is null) then raise exception 'Orphan stack identity requires review'; end if;
  if exists(select 1 from public.user_stacks s left join auth.users u on u.id=s.user_id where u.id is null)
     or exists(select 1 from public.stack_products sp left join public.user_stacks s on s.id=sp.stack_id left join public.products p on p.id=sp.product_id where s.id is null or p.id is null) then raise exception 'Orphan stack reference requires review'; end if;
  if not exists(select 1 from pg_index i where i.indrelid='public.stack_products'::regclass and i.indisunique and i.indisvalid and i.indisready and i.indpred is null and i.indnkeyatts=2 and (i.indkey::smallint[])[0]=(select attnum from pg_attribute where attrelid=i.indrelid and attname='stack_id') and (i.indkey::smallint[])[1]=(select attnum from pg_attribute where attrelid=i.indrelid and attname='product_id')) then raise exception 'Missing stack/product unique index'; end if;
  if exists(select 1 from public.stack_products group by stack_id,product_id having count(*)>1) then raise exception 'Duplicate items within a single stack require review'; end if;
  if exists(select 1 from pg_roles where rolname in ('anon','authenticated') and (rolsuper or rolbypassrls)) then raise exception 'Elevated browser role'; end if;
end $$;

-- Preserve non-browser staff policies/grants; close cumulative direct write paths.
do $$
declare t text; cols text; p record; kept text;
begin
  foreach t in array array['user_stacks','stack_products'] loop
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    select string_agg(quote_ident(attname),',') into cols from pg_attribute where attrelid=('public.'||t)::regclass and attnum>0 and not attisdropped;
    execute format('revoke all (%s) on public.%I from public,anon,authenticated',cols,t);
    if has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,REFERENCES')
       or has_table_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege('authenticated','public.'||t,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Inherited stack privileges remain on %',t; end if;
    for p in select * from pg_policy where polrelid=('public.'||t)::regclass loop
      if exists(select 1 from unnest(p.polroles) r where case when r=0 then true else pg_has_role('anon',r,'USAGE') or pg_has_role('authenticated',r,'USAGE') end) then
        select string_agg(quote_ident(rolname),',') into kept from pg_roles where oid=any(p.polroles) and not pg_has_role('anon',oid,'USAGE') and not pg_has_role('authenticated',oid,'USAGE');
        if kept is null then execute format('drop policy %I on public.%I',p.polname,t); else execute format('alter policy %I on public.%I to %s',p.polname,t,kept); end if;
      end if;
    end loop;
    execute format('alter table public.%I enable row level security',t);
  end loop;
end $$;

create schema tll_stack_private;
revoke all on schema tll_stack_private from public,anon,authenticated;
create table tll_stack_private.repair_journal (
  source_stack_id uuid primary key references public.user_stacks(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  canonical_stack_id uuid not null,
  before_stack jsonb not null, before_items jsonb not null,
  after_stack jsonb, after_items jsonb,
  conflicts jsonb not null default '[]',
  repaired_at timestamptz not null default now()
);
create table tll_stack_private.mutation_receipts (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null, fingerprint bytea not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id,request_id)
);
revoke all on all tables in schema tll_stack_private from public,anon,authenticated;

-- Canonical = earliest known creation timestamp, then immutable UUID. All
-- original rows/items remain. Conflicting servings are never summed/overwritten.
insert into tll_stack_private.repair_journal(source_stack_id,user_id,canonical_stack_id,before_stack,before_items,conflicts)
select s.id,s.user_id,g.canonical,to_jsonb(s),coalesce((select jsonb_agg(to_jsonb(sp) order by sp.id) from public.stack_products sp where sp.stack_id=s.id),'[]'),
 coalesce((select jsonb_agg(jsonb_build_object('product_id',c.product_id,'servings',c.servings) order by c.product_id) from (
   select sp.product_id,array_agg(distinct coalesce(trim_scale(sp.servings_per_day)::text,'NULL') order by coalesce(trim_scale(sp.servings_per_day)::text,'NULL')) servings
   from public.user_stacks us join public.stack_products sp on sp.stack_id=us.id
   where us.user_id=s.user_id and us.is_active is true group by sp.product_id having count(distinct coalesce(trim_scale(sp.servings_per_day)::text,'NULL'))>1 or bool_or(sp.servings_per_day is null or sp.servings_per_day::text in ('NaN','Infinity','-Infinity') or sp.servings_per_day<1 or sp.servings_per_day>10 or trunc(sp.servings_per_day)<>sp.servings_per_day)
 ) c),'[]')
from public.user_stacks s join (
 select user_id,(array_agg(id order by created_at nulls last,id))[1] canonical from public.user_stacks where is_active is true group by user_id having count(*)>1
) g on g.user_id=s.user_id where s.is_active is true;

insert into public.stack_products(stack_id,product_id,servings_per_day,added_at)
select j.canonical_stack_id,sp.product_id,min(sp.servings_per_day),min(sp.added_at)
from tll_stack_private.repair_journal j join public.stack_products sp on sp.stack_id=j.source_stack_id
where not exists(select 1 from public.stack_products existing where existing.stack_id=j.canonical_stack_id and existing.product_id=sp.product_id)
group by j.canonical_stack_id,sp.product_id
having count(distinct coalesce(trim_scale(sp.servings_per_day)::text,'NULL'))=1
 and bool_and(sp.servings_per_day is not null and sp.servings_per_day::text not in ('NaN','Infinity','-Infinity') and sp.servings_per_day>=1 and sp.servings_per_day<=10 and trunc(sp.servings_per_day)=sp.servings_per_day);
update public.user_stacks s set is_active=false from tll_stack_private.repair_journal j where j.source_stack_id=s.id and s.id<>j.canonical_stack_id;
alter table public.user_stacks add column revision bigint not null default 0 check(revision>=0);
create unique index user_stacks_one_active_per_user on public.user_stacks(user_id) where is_active is true;
update tll_stack_private.repair_journal j set after_stack=to_jsonb(s),after_items=coalesce((select jsonb_agg(to_jsonb(sp) order by sp.id) from public.stack_products sp where sp.stack_id=s.id),'[]') from public.user_stacks s where s.id=j.source_stack_id;

-- Reads remain available to each owner. Only the RPC below may mutate via a
-- browser role. Staff/service access remains subject to its existing grants.
grant select on public.user_stacks,public.stack_products to authenticated;
create policy stack_read_own on public.user_stacks for select to authenticated using(user_id=auth.uid());
create policy stack_items_read_own on public.stack_products for select to authenticated using(exists(select 1 from public.user_stacks s where s.id=stack_id and s.user_id=auth.uid()));

create function public.bump_stack_revision() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op in ('UPDATE','DELETE') then update public.user_stacks set revision=revision+1,updated_at=clock_timestamp() where id=old.stack_id; end if;
  if tg_op='INSERT' or (tg_op='UPDATE' and new.stack_id is distinct from old.stack_id) then update public.user_stacks set revision=revision+1,updated_at=clock_timestamp() where id=new.stack_id; end if;
  return null;
end $$;
revoke all on function public.bump_stack_revision() from public,anon,authenticated;
create trigger tll_stack_revision after insert or update or delete on public.stack_products for each row execute function public.bump_stack_revision();

create function public.get_active_stack() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.user_stacks%rowtype; items jsonb;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into s from public.user_stacks where user_id=u and is_active is true;
  if s.id is null then return jsonb_build_object('userId',u,'stackId',null,'revision',0,'items','[]'::jsonb,'recoveryConflicts',0); end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',sp.id,'servings_per_day',sp.servings_per_day,'product_id',sp.product_id,'products',case when p.id is null then null else
    jsonb_build_object('id',p.id,'name',p.name,'brand',p.brand,'category',p.category,'serving_size',p.serving_size,'serving_unit',p.serving_unit,'buy_url',p.buy_url,
      'product_nutrients',coalesce((select jsonb_agg(jsonb_build_object('nutrient_name',n.nutrient_name,'amount',n.amount,'unit',n.unit)) from public.product_nutrients n where n.product_id=p.id),'[]'::jsonb)) end) order by sp.added_at nulls last,sp.id),'[]'::jsonb)
  into items from public.stack_products sp left join public.products p on p.id=sp.product_id and p.status='active' where sp.stack_id=s.id;
  return jsonb_build_object('userId',u,'stackId',s.id,'revision',s.revision,'items',items,'recoveryConflicts',coalesce((select max(jsonb_array_length(conflicts)) from tll_stack_private.repair_journal where user_id=u),0));
end $$;
revoke all on function public.get_active_stack() from public,anon,authenticated;
grant execute on function public.get_active_stack() to authenticated;

create function public.mutate_active_stack(p_operation text,p_product_ids uuid[],p_request_id uuid,p_expected_revision bigint default null,p_servings numeric default 1)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); s public.user_stacks%rowtype; fp bytea; previous tll_stack_private.mutation_receipts%rowtype;
  accepted uuid[]:='{}'; rejected uuid[]:='{}'; result jsonb; n integer;
begin
  if u is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_product_ids is null or coalesce(array_ndims(p_product_ids),1)<>1 or (cardinality(p_product_ids)>0 and array_lower(p_product_ids,1)<>1) then return jsonb_build_object('status','invalid'); end if;
  if p_operation is null or p_operation not in ('add','merge','remove','clear','servings') or p_request_id is null
     or p_product_ids is null or array_ndims(p_product_ids)>1 or cardinality(p_product_ids)>100 or array_position(p_product_ids,null) is not null
     or (p_operation in ('add','remove','servings') and cardinality(p_product_ids)<>1)
     or (p_operation='merge' and cardinality(p_product_ids)=0) or (p_operation='clear' and cardinality(p_product_ids)<>0)
     or p_servings is null or p_servings::text in ('NaN','Infinity','-Infinity') or p_servings<1 or p_servings>10 or trunc(p_servings)<>p_servings
     or (p_operation in ('remove','clear','servings') and (p_expected_revision is null or p_expected_revision<0)) then
    return jsonb_build_object('status','invalid');
  end if;
  fp:=extensions.digest(convert_to(jsonb_build_object('operation',p_operation,'products',p_product_ids,'revision',p_expected_revision,'servings',p_servings)::text,'UTF8'),'sha256');
  perform pg_advisory_xact_lock(hashtextextended(u::text,91703009));
  select * into previous from tll_stack_private.mutation_receipts where user_id=u and request_id=p_request_id;
  if found then
    if previous.fingerprint<>fp then return jsonb_build_object('status','idempotency_conflict'); end if;
    return previous.result||jsonb_build_object('duplicate',true,'snapshot',public.get_active_stack());
  end if;
  select * into s from public.user_stacks where user_id=u and is_active is true for update;
  if p_operation in ('remove','clear','servings') and coalesce(s.revision,0)<>p_expected_revision then
    return jsonb_build_object('status','conflict','snapshot',public.get_active_stack());
  end if;
  if p_operation in ('add','merge') then
    select coalesce(array_agg(distinct p.id order by p.id),'{}') into accepted from unnest(p_product_ids) x join public.products p on p.id=x and p.status='active';
    select coalesce(array_agg(distinct x order by x),'{}') into rejected from unnest(p_product_ids) x where not (x=any(accepted));
    if cardinality(accepted)>0 then
      if s.id is null then
        insert into public.user_stacks(user_id,name,is_active) values(u,'My Stack',true) on conflict(user_id) where is_active is true do nothing returning * into s;
        if s.id is null then select * into s from public.user_stacks where user_id=u and is_active is true for update; end if;
      end if;
      insert into public.stack_products(stack_id,product_id,servings_per_day) select s.id,x,p_servings from unnest(accepted) x on conflict(stack_id,product_id) do nothing;
    end if;
  elsif s.id is null and p_operation='servings' then
    return jsonb_build_object('status','not_found','snapshot',public.get_active_stack());
  elsif s.id is not null and p_operation='remove' then
    delete from public.stack_products where stack_id=s.id and product_id=p_product_ids[1];
  elsif s.id is not null and p_operation='clear' then
    delete from public.stack_products where stack_id=s.id;
  elsif s.id is not null and p_operation='servings' then
    update public.stack_products set servings_per_day=p_servings where stack_id=s.id and product_id=p_product_ids[1] and servings_per_day is distinct from p_servings;
    get diagnostics n=row_count;
    if n=0 and not exists(select 1 from public.stack_products where stack_id=s.id and product_id=p_product_ids[1]) then return jsonb_build_object('status','not_found','snapshot',public.get_active_stack()); end if;
  end if;
  result:=jsonb_build_object('status','applied','acceptedIds',accepted,'rejectedIds',rejected,'duplicate',false);
  insert into tll_stack_private.mutation_receipts(user_id,request_id,fingerprint,result) values(u,p_request_id,fp,result);
  return result||jsonb_build_object('snapshot',public.get_active_stack());
end $$;
revoke all on function public.mutate_active_stack(text,uuid[],uuid,bigint,numeric) from public,anon,authenticated;
grant execute on function public.mutate_active_stack(text,uuid[],uuid,bigint,numeric) to authenticated;

-- Do not trust named REVOKEs alone: inherited default ACLs are cumulative.
do $$
declare r text; o record;
begin
  foreach r in array array['anon','authenticated'] loop
    if has_function_privilege(r,'public.bump_stack_revision()','EXECUTE') then raise exception 'Revision trigger execution inherited by %',r; end if;
    if r='anon' and (has_function_privilege(r,'public.get_active_stack()','EXECUTE') or has_function_privilege(r,'public.mutate_active_stack(text,uuid[],uuid,bigint,numeric)','EXECUTE')) then raise exception 'Anonymous stack RPC execution inherited'; end if;
    if has_schema_privilege(r,'tll_stack_private','USAGE,CREATE') then raise exception 'Private stack schema privilege inherited by %',r; end if;
    for o in select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='tll_stack_private' and c.relkind in ('r','p','v','m','f') loop
      if has_table_privilege(r,o.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r,o.oid,'SELECT,INSERT,UPDATE,REFERENCES') then raise exception 'Private stack table privilege inherited by %',r; end if;
    end loop;
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
