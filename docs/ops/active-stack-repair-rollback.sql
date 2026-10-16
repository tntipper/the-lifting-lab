-- Optional DATA-REPAIR reversal only; prefer reviewed forward reconciliation.
-- Does NOT reopen browser writes. Keep the stack UI/API in maintenance while
-- using this script. The operator must explicitly set the local opt-in below.
begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
-- set local tll.stack_repair_rollback='restore-pre-migration';
do $$ begin
 if current_setting('tll.stack_repair_rollback',true) is distinct from 'restore-pre-migration' then raise exception 'Explicit stack repair rollback opt-in is required'; end if;
end $$;
lock table public.user_stacks,public.stack_products in access exclusive mode;
do $$ begin
 if exists(select 1 from tll_stack_private.repair_journal j left join public.user_stacks s on s.id=j.source_stack_id
  where to_jsonb(s) is distinct from j.after_stack or coalesce((select jsonb_agg(to_jsonb(sp) order by sp.id) from public.stack_products sp where sp.stack_id=j.source_stack_id),'[]'::jsonb) is distinct from j.after_items)
 then raise exception 'Affected stacks changed after repair; reconcile manually without deleting newer data'; end if;
end $$;
revoke execute on function public.mutate_active_stack(text,uuid[],uuid,bigint,numeric) from authenticated;
-- Remove only the rows this repair copied, after exact post-state verification.
drop trigger tll_stack_revision on public.stack_products;
delete from public.stack_products sp using tll_stack_private.repair_journal j
 where sp.stack_id=j.source_stack_id and not exists(select 1 from jsonb_array_elements(j.before_items) original where (original->>'id')::uuid=sp.id);
drop index public.user_stacks_one_active_per_user;
update public.user_stacks s set is_active=(j.before_stack->>'is_active')::boolean,updated_at=(j.before_stack->>'updated_at')::timestamptz
 from tll_stack_private.repair_journal j where s.id=j.source_stack_id;
-- Retain journal, original items, new revision column and all private/write
-- boundaries. The singleton invariant is now suspended: keep mutations disabled
-- until a reviewed forward migration restores it. No blind broad-grant rollback.
commit;
