-- Stage 0: F01/F02 and the database portion of F28.
-- Additive, transactional; no production data repairs or owner changes.
-- Prerequisite: legacy accounts 01–09, favourites, stacks and submission tables.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Fail closed on an unexpected installation; do not silently skip protection.
do $$
declare v_table text; v_function regprocedure;
begin
  foreach v_table in array array['profiles','reviews','products','product_nutrients',
      'points_ledger','share_claims','avatar_unlocks','avatar_catalog','points_config',
      'user_favourites','user_stacks','stack_products','supplement_submissions','public_profiles'] loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'Missing prerequisite public.%', v_table;
    end if;
  end loop;
  v_function := to_regprocedure('public.award_points(text,text)');
  if v_function is null or not (select prosecdef from pg_proc where oid = v_function) then
    raise exception 'Expected existing SECURITY DEFINER award_points(text,text)';
  end if;
  if exists (select 1 from pg_roles where rolname in ('anon','authenticated')
             and (rolsuper or rolbypassrls)) then
    raise exception 'Client role has elevated privileges; resolve role configuration first';
  end if;
end;
$$;

-- Table-level revocation alone DOES NOT remove old column ACLs.
-- Leave service/admin grants and object/function ownership intact.
do $$
declare v_table text; v_columns text;
begin
  foreach v_table in array array['profiles','reviews','products','product_nutrients',
      'points_ledger','share_claims','avatar_unlocks','public_profiles'] loop
    execute format('revoke all privileges on table public.%I from public, anon, authenticated', v_table);
    select string_agg(quote_ident(attname), ', ' order by attnum) into v_columns
      from pg_attribute where attrelid = to_regclass('public.' || v_table)
      and attnum > 0 and not attisdropped;
    execute format('revoke all privileges (%s) on table public.%I from public, anon, authenticated', v_columns, v_table);
  end loop;
end;
$$;

grant select on public.profiles, public.points_ledger, public.share_claims, public.avatar_unlocks to authenticated;
grant select on public.products, public.product_nutrients, public.public_profiles, public.reviews to anon, authenticated;
grant update (username, display_name, avatar_type, avatar_id, avatar_url) on public.profiles to authenticated;
grant insert (user_id, product_id, rating, body), update (rating, body), delete on public.reviews to authenticated;

-- Remove obsolete client publication/authority policies as well as grants.
-- RLS now denies those writes even if a future broad ACL is accidentally added.
do $$
declare v_policy record; v_table text;
begin
  foreach v_table in array array['products','product_nutrients','points_ledger','share_claims','avatar_unlocks'] loop
    execute format('alter table public.%I enable row level security', v_table);
    for v_policy in select p.polname from pg_policy p
      where p.polrelid = to_regclass('public.' || v_table) and p.polcmd <> 'r'
      and exists (select 1 from unnest(p.polroles) r(role_oid)
        where case when role_oid = 0 then true else
          pg_has_role('anon', role_oid, 'USAGE') or pg_has_role('authenticated', role_oid, 'USAGE') end)
    loop
      execute format('drop policy %I on public.%I', v_policy.polname, v_table);
    end loop;
  end loop;
end;
$$;

-- Replace ALL client-applicable profile/review policies, including historical
-- duplicate names and inherited-role policies. Keep service-only policies.
do $$
declare v_policy record;
begin
  for v_policy in
    select p.polname, p.polrelid::regclass as relation
    from pg_policy p
    where p.polrelid in ('public.profiles'::regclass, 'public.reviews'::regclass)
    and exists (select 1 from unnest(p.polroles) r(role_oid)
                where case when role_oid = 0 then true else
                  pg_has_role('anon', role_oid, 'USAGE') or
                  pg_has_role('authenticated', role_oid, 'USAGE') end)
  loop
    execute format('drop policy %I on %s', v_policy.polname, v_policy.relation);
  end loop;
end;
$$;
alter table public.profiles enable row level security;
alter table public.reviews enable row level security;
create policy profiles_select_own on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy reviews_select_public on public.reviews for select to anon, authenticated
  using (status = 'approved' or (status = 'pending' and created_at < now() - interval '24 hours')
         or (select auth.uid()) = user_id);
create policy reviews_insert_own on public.reviews for insert to authenticated
  with check ((select auth.uid()) = user_id and status = 'pending');
create policy reviews_update_own on public.reviews for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy reviews_delete_own on public.reviews for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The supported community form already writes to this moderation inbox,
-- never products. Preserve it for both public and signed-in clients.
drop policy if exists allow_public_insert_supplement on public.supplement_submissions;
create policy allow_public_insert_supplement on public.supplement_submissions
  for insert to anon, authenticated with check (true);
grant insert (category, brand, product_name, url, notes, email)
  on public.supplement_submissions to anon, authenticated;

-- Trigger is deliberately SECURITY INVOKER. SECURITY DEFINER reward/profile
-- RPCs retain their existing owners and may update authoritative columns.
create or replace function public.guard_profile_client_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare v_avatar public.avatar_catalog%rowtype;
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = current_user
             and (rolsuper or rolbypassrls)) then return new; end if;
  if pg_catalog.pg_has_role(current_user,
      (select relowner from pg_catalog.pg_class where oid = TG_RELID), 'USAGE') then
    return new;
  end if;
  if auth.uid() is null or new.id <> auth.uid() then
    raise exception 'Profile ownership mismatch' using errcode = '42501';
  end if;
  if new.username is distinct from old.username and new.username !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Invalid username' using errcode = '23514';
  end if;
  if new.display_name is distinct from old.display_name and char_length(new.display_name) > 40 then
    raise exception 'Display name too long' using errcode = '23514';
  end if;
  if (new.avatar_type, new.avatar_id, new.avatar_url) is distinct from
     (old.avatar_type, old.avatar_id, old.avatar_url) then
    select * into v_avatar from public.avatar_catalog where id = new.avatar_id;
    if not found then raise exception 'Unknown avatar' using errcode = '23514'; end if;
    if v_avatar.type <> 'standard' and not exists (
      select 1 from public.avatar_unlocks where user_id = auth.uid() and avatar_id = new.avatar_id
    ) then raise exception 'Avatar not owned' using errcode = '42501'; end if;
    if new.avatar_type <> (case when new.avatar_id = 'custom-photo' then 'custom_photo' else v_avatar.type end) then
      raise exception 'Avatar type mismatch' using errcode = '23514';
    end if;
    if new.avatar_id = 'custom-photo' then
      if new.avatar_url is null or new.avatar_url !~ '^https://[^/]+/storage/v1/object/public/avatars/'
         or split_part(new.avatar_url, '/storage/v1/object/public/avatars/', 2)
            not like auth.uid()::text || '/%' then
        raise exception 'Custom photo must use the caller avatar folder' using errcode = '23514';
      end if;
    else
      new.avatar_url := null;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_client_edit() from public, anon, authenticated;
drop trigger if exists guard_profile_client_edit on public.profiles;
create trigger guard_profile_client_edit before update on public.profiles
  for each row execute function public.guard_profile_client_edit();

create or replace function public.guard_review_client_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from pg_catalog.pg_roles where rolname = current_user
             and (rolsuper or rolbypassrls)) then return new; end if;
  if pg_catalog.pg_has_role(current_user,
      (select relowner from pg_catalog.pg_class where oid = TG_RELID), 'USAGE') then return new; end if;
  if auth.uid() is null or new.user_id <> auth.uid() then
    raise exception 'Review ownership mismatch' using errcode = '42501';
  end if;
  if TG_OP = 'INSERT' then
    new.status := 'pending';
    new.created_at := clock_timestamp();
  elsif (new.rating, new.body) is distinct from (old.rating, old.body) then
    -- An edit cannot inherit approval/age. Flagged content stays flagged.
    new.status := case when old.status = 'flagged' then 'flagged' else 'pending' end;
    new.created_at := clock_timestamp();
  end if;
  return new;
end;
$$;
revoke all on function public.guard_review_client_edit() from public, anon, authenticated;
drop trigger if exists guard_review_client_edit on public.reviews;
create trigger guard_review_client_edit before insert or update on public.reviews
  for each row execute function public.guard_review_client_edit();

-- Preserve signature and owner. One user/action lock matches all supported
-- allowance scopes, including per_day where supplied ref IDs are irrelevant.
create or replace function public.award_points(p_action text, p_ref_id text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_cfg public.points_config%rowtype;
  v_ref text := p_ref_id;
  v_now timestamptz;
  v_rows integer;
begin
  if v_user is null or p_action is null or p_action not in
      ('signup','daily_login','review','favourite','build_stack','share') then return 0; end if;
  perform pg_advisory_xact_lock(hashtextextended('tll:points:' || v_user::text || ':' || p_action, 0));
  v_now := clock_timestamp();
  select * into v_cfg from public.points_config where action_type = p_action;
  if not found or not v_cfg.enabled or v_cfg.points <= 0 then return 0; end if;
  if not exists (select 1 from public.profiles where id = v_user) then return 0; end if;
  if v_cfg.limit_type in ('once','per_day') then v_ref := null; end if;
  if v_cfg.limit_type in ('once_per_ref','per_ref_cooldown') and nullif(v_ref, '') is null then return 0; end if;
  if v_cfg.min_account_age_hours > 0 and not exists (
    select 1 from auth.users where id = v_user
      and created_at <= v_now - make_interval(hours => v_cfg.min_account_age_hours)
  ) then return 0; end if;

  if p_action = 'review' and not exists (
    select 1 from public.reviews where user_id = v_user and product_id::text = v_ref
  ) then return 0;
  elsif p_action = 'favourite' and not exists (
    select 1 from public.user_favourites where user_id = v_user and product_id::text = v_ref
  ) then return 0;
  elsif p_action = 'build_stack' and not exists (
    select 1 from public.user_stacks s join public.stack_products sp on sp.stack_id = s.id
    where s.id::text = v_ref and s.user_id = v_user group by s.id
    having count(distinct sp.product_id) >= 3
  ) then return 0;
  elsif p_action = 'share' and not exists (
    select 1 from public.products where id::text = v_ref and status = 'active'
  ) then return 0;
  end if;

  if v_cfg.limit_type = 'once' then
    if exists (select 1 from public.points_ledger where user_id = v_user and action_type = p_action) then return 0; end if;
  elsif v_cfg.limit_type = 'once_per_ref' then
    if exists (select 1 from public.points_ledger where user_id = v_user and action_type = p_action
               and ref_id = v_ref) then return 0; end if;
  elsif v_cfg.limit_type = 'per_ref_cooldown' then
    if exists (select 1 from public.points_ledger where user_id = v_user and action_type = p_action
               and ref_id is not distinct from v_ref
               and created_at > v_now - make_interval(hours => greatest(v_cfg.cooldown_hours, 1))) then return 0; end if;
  elsif v_cfg.limit_type = 'per_day' then
    if exists (select 1 from public.points_ledger where user_id = v_user and action_type = p_action
               and (created_at at time zone 'UTC')::date = (v_now at time zone 'UTC')::date) then return 0; end if;
  else return 0;
  end if;

  insert into public.points_ledger (user_id, action_type, points, season_id, ref_id, created_at)
  values (v_user, p_action, v_cfg.points, public.current_season(), v_ref, v_now)
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  if v_rows = 0 then return 0; end if;
  update public.profiles set total_points = total_points + v_cfg.points where id = v_user;
  if p_action = 'share' then
    insert into public.share_claims (user_id, product_id, claimed_at) values (v_user, v_ref, v_now);
  end if;
  return v_cfg.points;
end;
$$;
revoke execute on function public.award_points(text,text) from public, anon;
grant execute on function public.award_points(text,text) to authenticated, service_role;

-- Detect remaining inherited ACLs instead of silently accepting an unsafe
-- custom role hierarchy. This includes updatable definer views.
do $$
declare v_table text; v_role text; v_col record;
begin
  foreach v_role in array array['anon','authenticated'] loop
    foreach v_table in array array['profiles','reviews','products','product_nutrients',
        'points_ledger','share_claims','avatar_unlocks','public_profiles'] loop
      for v_col in select attname from pg_attribute
        where attrelid = to_regclass('public.' || v_table) and attnum > 0 and not attisdropped loop
        if has_column_privilege(v_role, 'public.' || v_table, v_col.attname, 'INSERT')
           and not (v_role = 'authenticated' and v_table = 'reviews'
                    and v_col.attname in ('user_id','product_id','rating','body')) then
          raise exception 'Unexpected effective INSERT: %.%.%', v_role, v_table, v_col.attname;
        end if;
        if has_column_privilege(v_role, 'public.' || v_table, v_col.attname, 'UPDATE')
           and not (v_role = 'authenticated' and
             ((v_table = 'profiles' and v_col.attname in ('username','display_name','avatar_type','avatar_id','avatar_url'))
              or (v_table = 'reviews' and v_col.attname in ('rating','body')))) then
          raise exception 'Unexpected effective UPDATE: %.%.%', v_role, v_table, v_col.attname;
        end if;
      end loop;
      if has_table_privilege(v_role, 'public.' || v_table, 'DELETE')
         and not (v_role = 'authenticated' and v_table = 'reviews') then
        raise exception 'Unexpected effective DELETE: %.%', v_role, v_table;
      end if;
      if has_table_privilege(v_role, 'public.' || v_table, 'TRUNCATE,TRIGGER') then
        raise exception 'Unexpected elevated table privilege: %.%', v_role, v_table;
      end if;
    end loop;
  end loop;
end;
$$;
notify pgrst, 'reload schema';
commit;
