-- Read-only inventory. Keep environment-specific output in PRIVATE evidence.
-- Run with the approved migration role before staging/production application.
select current_database() as database, current_user as migration_role, version();
select c.relname, c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in
 ('profiles','reviews','products','product_nutrients','points_ledger','share_claims','avatar_unlocks','public_profiles');
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where schemaname='public' and tablename in
 ('profiles','reviews','products','product_nutrients','points_ledger','share_claims','avatar_unlocks','supplement_submissions')
order by tablename,policyname;
-- Effective privileges include table ACLs, column ACLs, PUBLIC and inheritance.
select r.role_name, c.relname, a.attname,
 has_column_privilege(r.role_name,c.oid,a.attnum,'SELECT') as can_select,
 has_column_privilege(r.role_name,c.oid,a.attnum,'INSERT') as can_insert,
 has_column_privilege(r.role_name,c.oid,a.attnum,'UPDATE') as can_update,
 has_column_privilege(r.role_name,c.oid,a.attnum,'REFERENCES') as can_reference
from pg_class c join pg_namespace n on n.oid=c.relnamespace
join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
cross join (values('anon'),('authenticated'),('service_role')) r(role_name)
where n.nspname='public' and c.relname in
 ('profiles','reviews','products','product_nutrients','points_ledger','share_claims','avatar_unlocks','public_profiles')
order by c.relname,r.role_name,a.attnum;
select r.role_name,c.relname,
 has_table_privilege(r.role_name,c.oid,'DELETE') as can_delete,
 has_table_privilege(r.role_name,c.oid,'TRUNCATE') as can_truncate,
 has_table_privilege(r.role_name,c.oid,'TRIGGER') as can_trigger
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('anon'),('authenticated'),('service_role')) r(role_name)
where n.nspname='public' and c.relname in
 ('profiles','reviews','products','product_nutrients','points_ledger','share_claims','avatar_unlocks','public_profiles');
select p.oid::regprocedure as function, pg_get_userbyid(p.proowner) as owner,
 p.prosecdef as security_definer,p.proconfig,p.proacl
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname in
 ('award_points','claim_referral','ensure_profile','handle_new_user','unlock_avatar','get_product_reviews');
