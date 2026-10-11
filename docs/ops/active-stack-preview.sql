-- READ ONLY. Run before the migration, exporting the result to private evidence.
-- A review report, not permission to execute the migration. No customer content
-- or result exports belong in the public repository.
begin transaction read only;
with ranked as (
 select s.*,first_value(id) over(partition by user_id order by created_at nulls last,id) canonical_stack_id,
 count(*) over(partition by user_id) active_count
 from public.user_stacks s where is_active is true
), products as (
 select r.user_id,r.canonical_stack_id,sp.product_id,
 count(distinct coalesce(trim_scale(sp.servings_per_day)::text,'NULL')) serving_versions,
 bool_and(sp.servings_per_day is not null and sp.servings_per_day::text not in ('NaN','Infinity','-Infinity') and sp.servings_per_day>=1 and sp.servings_per_day<=10 and trunc(sp.servings_per_day)=sp.servings_per_day) valid_servings,
 bool_or(sp.stack_id=r.canonical_stack_id) canonical_already_contains,
 jsonb_agg(jsonb_build_object('source_stack_id',sp.stack_id,'row_id',sp.id,'servings_per_day',sp.servings_per_day) order by sp.stack_id,sp.id) source_items
 from ranked r join public.stack_products sp on sp.stack_id=r.id where r.active_count>1
 group by r.user_id,r.canonical_stack_id,sp.product_id
)
select p.*,case when canonical_already_contains and (serving_versions>1 or not valid_servings) then 'KEEP_CANONICAL_AND_REVIEW_CONFLICT'
 when canonical_already_contains then 'KEEP_CANONICAL'
 when serving_versions=1 and valid_servings then 'COPY_UNAMBIGUOUS_MISSING_PRODUCT'
 else 'PRESERVE_ARCHIVES_REQUIRES_SERVING_REVIEW' end repair_action
from products p order by user_id,product_id;
-- Empty duplicate stacks also need to appear in the review.
select user_id,array_agg(id order by created_at nulls last,id) active_stack_ids,count(*) active_count
from public.user_stacks where is_active is true group by user_id having count(*)>1;
select s.user_id,sp.id,sp.stack_id,sp.product_id,sp.servings_per_day from public.stack_products sp join public.user_stacks s on s.id=sp.stack_id
where sp.servings_per_day is null or sp.servings_per_day::text in ('NaN','Infinity','-Infinity') or sp.servings_per_day<1 or sp.servings_per_day>10 or trunc(sp.servings_per_day)<>sp.servings_per_day;
select c.relname,pg_get_userbyid(c.relowner) owner,c.relacl from pg_class c where c.oid in('public.user_stacks'::regclass,'public.stack_products'::regclass);
select conrelid::regclass relation,conname,pg_get_constraintdef(oid) definition from pg_constraint where conrelid in('public.user_stacks'::regclass,'public.stack_products'::regclass);
rollback;
