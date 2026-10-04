\set ON_ERROR_STOP on
begin;
-- Helpers use invoker rights so forbidden statements run as the client role.
create function public.test_assert(ok boolean, label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %', label; end if; end $$;
create function public.test_denied(command text, label text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when insufficient_privilege then return;
  end;
  raise exception 'FAIL: expected permission denial: %', label;
end $$;
create function public.test_rejected(command text, label text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when insufficient_privilege or check_violation then return;
  end;
  raise exception 'FAIL: expected rejection: %', label;
end $$;

set local role anon;
select public.test_assert((select count(*) = 2 from public.products), 'public product read survives');
select public.test_denied('select * from public.profiles', 'anonymous profile read');
select public.test_denied($q$insert into public.products(name,status) values('Attack','active')$q$, 'anonymous publish');
select public.test_denied($q$select public.award_points('signup',null)$q$, 'anonymous award');
insert into public.supplement_submissions(category,brand,product_name,url)
 values ('whey','Fixture','Public submission','https://example.invalid/label');
select public.test_assert((select count(*)=0 from public.supplement_submissions), 'public moderation inbox unreadable');

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.test_assert((select count(*) = 1 from public.profiles), 'only own profile visible');
update public.profiles set username='fixture_user', display_name='Fixture', avatar_id='flask', avatar_type='standard'
 where id = auth.uid();
select public.test_assert((select username = 'fixture_user' and avatar_id='flask' from public.profiles where id=auth.uid()), 'profile API edit');
select public.test_denied('update public.profiles set total_points=999999 where id=auth.uid()', 'points inflation');
select public.test_denied('update public.profiles set points_spent=0 where id=auth.uid()', 'points spend override');
select public.test_denied('update public.profiles set referred_by=auth.uid() where id=auth.uid()', 'referral attribution override');
select public.test_denied('update public.profiles set referral_code=''OWNED'' where id=auth.uid()', 'referral code override');
select public.test_denied('update public.profiles set created_at=now()-interval ''1 year'' where id=auth.uid()', 'profile age override');
select public.test_denied('update public.profiles set email=''attack@example.invalid'' where id=auth.uid()', 'email override');
select public.test_denied('update public.public_profiles set total_points=999999 where id=auth.uid()', 'definer view update bypass');
select public.test_denied('insert into public.profiles(id,username,referral_code) values(auth.uid(),''attack'',''ATTACK'')', 'direct profile insert');
select public.test_rejected('update public.profiles set avatar_id=''gold-barbell'',avatar_type=''premium'' where id=auth.uid()', 'unowned premium avatar');
select public.test_rejected('update public.profiles set avatar_id=''barbell'',avatar_type=''premium'' where id=auth.uid()', 'spoofed avatar type');
select public.test_rejected('update public.profiles set username=''bad username'' where id=auth.uid()', 'direct username validation');
update public.profiles set display_name='Must not change' where id='10000000-0000-4000-8000-000000000002';

select public.test_denied($q$insert into public.products(name,status,source,submitted_by) values('Attack','active','tll_reviewed',null)$q$, 'authenticated direct publish');
select public.test_denied($q$insert into public.products(name,status) values('Attack','pending')$q$, 'products bypass of submission inbox');
select public.test_denied($q$insert into public.product_nutrients(product_id,amount) values('20000000-0000-4000-8000-000000000001',999)$q$, 'nutrient injection');
insert into public.supplement_submissions(category,brand,product_name,url)
 values ('whey','Fixture','Signed in submission','https://example.invalid/label');

select public.test_denied($q$insert into public.reviews(user_id,product_id,rating,status) values(auth.uid(),'20000000-0000-4000-8000-000000000001',5,'approved')$q$, 'review self approval');
select public.test_denied($q$insert into public.reviews(user_id,product_id,rating,created_at) values(auth.uid(),'20000000-0000-4000-8000-000000000001',5,now()-interval '2 days')$q$, 'review backdating');
select public.test_denied($q$insert into public.reviews(user_id,product_id,rating) values('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',5)$q$, 'review spoofed owner');
insert into public.reviews(user_id,product_id,rating,body)
 values(auth.uid(),'20000000-0000-4000-8000-000000000001',5,'Synthetic review');
select public.test_assert((select status='pending' and created_at > now()-interval '1 minute' from public.reviews where user_id=auth.uid()), 'new review remains moderated');
select public.test_denied('update public.reviews set status=''approved'' where user_id=auth.uid()', 'review update self approval');
select public.test_denied('update public.reviews set created_at=now()-interval ''2 days'' where user_id=auth.uid()', 'review update backdating');
select public.test_denied('update public.reviews set product_id=''20000000-0000-4000-8000-000000000002'' where user_id=auth.uid()', 'review retarget');
select public.test_assert(public.award_points('review','20000000-0000-4000-8000-000000000001')=75, 'legitimate review award');
select public.test_assert(public.award_points('review','20000000-0000-4000-8000-000000000001')=0, 'review award once');
select public.test_assert(public.award_points('review','20000000-0000-4000-8000-000000000002')=0, 'nonexistent review no award');
select public.test_assert(public.award_points('share','anything-at-all')=0, 'arbitrary share reference');
select public.test_assert(public.award_points('share','20000000-0000-4000-8000-000000000003')=0, 'pending share reference');
select public.test_assert(public.award_points('share',null)=0, 'null share reference');
select public.test_assert(public.award_points('share','20000000-0000-4000-8000-000000000001')=25, 'active product share');
select public.test_assert(public.award_points('share','20000000-0000-4000-8000-000000000001')=0, 'share cooldown');
select public.test_assert(public.award_points('daily_login','variation-a')=5, 'daily login award');
select public.test_assert(public.award_points('daily_login','variation-b')=0, 'daily reference canonicalized');
select public.test_assert(public.award_points('referral',auth.uid()::text)=0, 'self referral award rejected');
select public.test_denied('insert into public.points_ledger(user_id,action_type,points) values(auth.uid(),''signup'',999)', 'direct ledger write');
select public.test_denied('insert into public.avatar_unlocks(user_id,avatar_id) values(auth.uid(),''gold-barbell'')', 'direct avatar unlock');
select public.test_denied('insert into public.share_claims(user_id,product_id) values(auth.uid(),''arbitrary'')', 'direct share evidence write');

set local role service_role;
select public.test_assert((select display_name is null from public.profiles where id='10000000-0000-4000-8000-000000000002'), 'cross-user update changed no rows');
update public.reviews set status='approved', created_at=now()-interval '2 days';
update public.profiles set total_points=2000 where id='10000000-0000-4000-8000-000000000001';
insert into public.products(name,status,source) values('Moderated publication','active','tll_reviewed');
set local role authenticated;
select public.test_assert((public.unlock_avatar('gold-barbell')->>'ok')::boolean, 'definer unlock still works');
update public.profiles set avatar_id='gold-barbell',avatar_type='premium' where id=auth.uid();
select public.test_assert((public.unlock_avatar('custom-photo')->>'ok')::boolean, 'custom slot unlock preserved');
update public.profiles set avatar_id='custom-photo',avatar_type='custom_photo',
 avatar_url='https://fixture.supabase.invalid/storage/v1/object/public/avatars/' || auth.uid()::text || '/avatar.png'
 where id=auth.uid();
select public.test_rejected($q$update public.profiles set avatar_url='https://fixture.supabase.invalid/storage/v1/object/public/avatars/10000000-0000-4000-8000-000000000002/avatar.png' where id=auth.uid()$q$, 'custom photo wrong user folder');
update public.profiles set avatar_id='flask',avatar_type='standard' where id=auth.uid();
select public.test_assert((select avatar_url is null from public.profiles where id=auth.uid()), 'standard selection clears custom URL');
update public.reviews set body='Edited after approval' where user_id=auth.uid();
select public.test_assert((select status='pending' and created_at > now()-interval '1 minute' from public.reviews where user_id=auth.uid()), 'edited approval resets moderation age');
set local role service_role;
update public.reviews set status='flagged';
set local role authenticated;
update public.reviews set body='Edited flagged review' where user_id=auth.uid();
select public.test_assert((select status='flagged' from public.reviews where user_id=auth.uid()), 'flag cannot be edited away');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.test_assert((select count(*)=0 from public.get_product_reviews('20000000-0000-4000-8000-000000000001')), 'flagged review invisible to another user via definer RPC');
select public.test_assert(public.claim_referral()=150, 'referral RPC preserved');
select public.test_assert(public.claim_referral()=0, 'referral once');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select public.test_assert(public.award_points('share','20000000-0000-4000-8000-000000000001')=0, 'share account-age gate');
reset role;
select public.test_assert((select prosecdef and proowner = (select oid from pg_roles where rolname=current_user)
  from pg_proc where oid='public.award_points(text,text)'::regprocedure), 'definer owner retained');
rollback;
\echo 'PASS: synthetic permission, API compatibility, moderation and reward acceptance'
