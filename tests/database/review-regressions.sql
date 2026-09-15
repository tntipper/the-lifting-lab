\set ON_ERROR_STOP on
begin;
-- Additional synthetic cases for the independent Stage 0 review. Everything
-- below, including deliberately weakened test policy, rolls back at the end.
do $$ begin
  if current_database() not in ('tll_stage0','tll_stage0_replay','tll_stage0_review') then
    raise exception 'Use the disposable local Stage 0 fixture';
  end if;
end $$;
create function public.test_review_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function public.test_review_denied(command text, label text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: expected permission denial: %', label;
end $$;
create function public.test_review_conflict(command text, label text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when unique_violation then return;
  end;
  raise exception 'FAIL: expected replacement conflict: %', label;
end $$;

insert into auth.users(id,email,created_at) values
 ('10000000-0000-4000-8000-000000000004','fixture_review_once@example.invalid',now()-interval '3 days'),
 ('10000000-0000-4000-8000-000000000005','fixture_review_daily@example.invalid',now()-interval '3 days'),
 ('10000000-0000-4000-8000-000000000006','fixture_review_delete@example.invalid',now()-interval '3 days');
insert into public.products(id,name,brand,status)
 values('20000000-0000-4000-8000-000000000004','Third reviewed fixture','Fixture','active');
insert into public.reviews(user_id,product_id,rating,body)
 select u,p,4,'Synthetic qualifying evidence'
 from unnest(array['10000000-0000-4000-8000-000000000004'::uuid,'10000000-0000-4000-8000-000000000005'::uuid]) u
 cross join unnest(array['20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000002'::uuid]) p;
insert into public.user_favourites(user_id,product_id)
 select user_id,product_id from public.reviews
 where user_id in ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005');
insert into public.user_stacks(id,user_id) values
 ('30000000-0000-4000-8000-000000000041','10000000-0000-4000-8000-000000000004'),
 ('30000000-0000-4000-8000-000000000042','10000000-0000-4000-8000-000000000004'),
 ('30000000-0000-4000-8000-000000000051','10000000-0000-4000-8000-000000000005'),
 ('30000000-0000-4000-8000-000000000052','10000000-0000-4000-8000-000000000005');
insert into public.stack_products(stack_id,product_id)
 select s.id,p from public.user_stacks s
 cross join unnest(array['20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000004'::uuid]) p
 where s.user_id in ('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005');

update public.points_config set limit_type='once'
 where action_type in ('review','favourite','build_stack','share');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000004')=0,'once still requires an owned review');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000004')=0,'once still requires an owned favourite');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000051')=0,'once still requires an owned stack');
select public.test_review_assert(public.award_points('share','not-a-product')=0,'once still requires an active product share');
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000001')=75,'once review uses submitted evidence');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000001')=10,'once favourite uses submitted evidence');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000041')=50,'once stack uses submitted evidence');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000001')=25,'once share uses submitted evidence');
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000002')=0,'once review caps a second qualifying product');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000002')=0,'once favourite caps a second qualifying product');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000042')=0,'once stack caps a second qualifying stack');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000002')=0,'once share caps a second qualifying product');
select public.test_review_assert((select count(*)=4 and bool_and(ref_id is null) from public.points_ledger where user_id=auth.uid()),'once ledger reference remains canonical');
select public.test_review_assert((select count(*)=1 and min(product_id)='20000000-0000-4000-8000-000000000001' from public.share_claims where user_id=auth.uid()),'once share claim preserves original product');
select public.test_review_assert((select total_points=160 from public.profiles where id=auth.uid()),'once profile matches credits');

reset role;
update public.points_config set limit_type='per_day'
 where action_type in ('review','favourite','build_stack','share');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000005',true);
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000004')=0,'daily still requires an owned review');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000004')=0,'daily still requires an owned favourite');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000041')=0,'daily still requires an owned stack');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000003')=0,'daily still requires an active product share');
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000001')=75,'daily review uses submitted evidence');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000001')=10,'daily favourite uses submitted evidence');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000051')=50,'daily stack uses submitted evidence');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000001')=25,'daily share uses submitted evidence');
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000002')=0,'daily review caps a second qualifying product');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000002')=0,'daily favourite caps a second qualifying product');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000052')=0,'daily stack caps a second qualifying stack');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000002')=0,'daily share caps a second qualifying product');
select public.test_review_assert((select count(*)=4 and bool_and(ref_id is null) from public.points_ledger where user_id=auth.uid()),'daily ledger reference remains canonical');
select public.test_review_assert((select count(*)=1 and min(product_id)='20000000-0000-4000-8000-000000000001' from public.share_claims where user_id=auth.uid()),'daily share claim preserves original product');

-- Move only synthetic credit times to the preceding UTC day; prove the next
-- day can award without waiting a real day or changing the machine clock.
reset role;
update public.points_ledger set created_at=clock_timestamp()-interval '1 day'
 where user_id='10000000-0000-4000-8000-000000000005';
set local role authenticated;
select public.test_review_assert(public.award_points('review','20000000-0000-4000-8000-000000000002')=75,'next UTC day review awards');
select public.test_review_assert(public.award_points('favourite','20000000-0000-4000-8000-000000000002')=10,'next UTC day favourite awards');
select public.test_review_assert(public.award_points('build_stack','30000000-0000-4000-8000-000000000052')=50,'next UTC day stack awards');
select public.test_review_assert(public.award_points('share','20000000-0000-4000-8000-000000000002')=25,'next UTC day share awards');
select public.test_review_assert((select total_points=320 from public.profiles where id=auth.uid()),'daily profile matches both days');
select public.test_review_assert((select count(*)=8 and bool_and(ref_id is null) from public.points_ledger where user_id=auth.uid()),'daily ledger contains two credits per action');
select public.test_review_assert((select count(*)=2 and count(distinct product_id)=2 from public.share_claims where user_id=auth.uid()),'daily share claims retain both product identities');

-- A moderator's flagged row must survive client DELETE so INSERT cannot reset
-- its status/age. Normal owner deletion and privileged cleanup still work.
reset role;
insert into public.reviews(user_id,product_id,rating,body,status) values
 ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',1,'Synthetic flagged content','flagged'),
 ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000002',4,'Synthetic pending content','pending'),
 ('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000004',4,'Synthetic approved content','approved');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000006',true);
with removed as (delete from public.reviews where user_id=auth.uid() and status='flagged' returning id)
 select public.test_review_assert((select count(*)=0 from removed),'RLS excludes flagged owner deletion');
select public.test_review_conflict($q$insert into public.reviews(user_id,product_id,rating,body) values(auth.uid(),'20000000-0000-4000-8000-000000000001',1,'Synthetic flagged content')$q$,'flagged delete/reinsert cannot become pending');
select public.test_review_assert((select status='flagged' from public.reviews where user_id=auth.uid() and product_id='20000000-0000-4000-8000-000000000001'),'replacement attempt retains moderator flag');
with removed as (delete from public.reviews where user_id=auth.uid() and status='pending' returning id)
 select public.test_review_assert((select count(*)=1 from removed),'normal owned pending deletion survives');
with removed as (delete from public.reviews where user_id=auth.uid() and status='approved' returning id)
 select public.test_review_assert((select count(*)=1 from removed),'normal owned approved deletion survives');
with removed as (delete from public.reviews where user_id='10000000-0000-4000-8000-000000000004' returning id)
 select public.test_review_assert((select count(*)=0 from removed),'another user review deletion remains excluded');

-- Deliberately loosen only this rollback-only fixture's delete policy: the
-- trigger must still deny the bypass if a broad policy is later introduced.
reset role;
create policy test_loose_review_delete on public.reviews for delete to authenticated using (true);
set local role authenticated;
select public.test_review_denied('delete from public.reviews where user_id=auth.uid()','trigger protects flagged row under permissive policy');
reset role;
drop policy test_loose_review_delete on public.reviews;
set local role service_role;
with removed as (delete from public.reviews where user_id='10000000-0000-4000-8000-000000000006' returning id)
 select public.test_review_assert((select count(*)=1 from removed),'authorised moderator can delete flagged row');
insert into public.reviews(user_id,product_id,rating,body,status)
 values('10000000-0000-4000-8000-000000000006','20000000-0000-4000-8000-000000000001',1,'Synthetic cascade fixture','flagged');
set local role authenticated;
select public.delete_own_account();
reset role;
select public.test_review_assert(not exists(select 1 from auth.users where id='10000000-0000-4000-8000-000000000006'),'definer account deletion survives flagged review cascade');
select public.test_review_assert(not exists(select 1 from public.reviews where user_id='10000000-0000-4000-8000-000000000006'),'account deletion cascades flagged review');
rollback;
\echo 'PASS: evidence-backed once/daily rewards and flagged review replacement regressions'
