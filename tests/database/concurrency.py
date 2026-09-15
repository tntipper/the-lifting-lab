#!/usr/bin/env python3
"""Exercise actual concurrent PostgreSQL sessions in the named LOCAL fixture.
No network URL/credential input, dependencies, production data or external calls.
Requires the bootstrap + migration already installed in tll-stage0-postgres.
"""
import concurrent.futures
import os
import re
import subprocess
import time

CONTAINER = os.environ.get('TLL_TEST_CONTAINER', 'tll-stage0-postgres')
if CONTAINER != 'tll-stage0-postgres' and not re.fullmatch(r'tll-stage0-ci-[0-9]+', CONTAINER):
    raise ValueError('Only explicitly named local synthetic fixture containers are allowed')
COMMAND = ['docker', 'exec', '-i', CONTAINER, 'psql', '-XqAt',
           '-U', 'postgres', '-d', 'tll_stage0', '-v', 'ON_ERROR_STOP=1']
USER = '10000000-0000-4000-8000-000000000002'
PRODUCT = '20000000-0000-4000-8000-000000000002'


def sql(source):
    result = subprocess.run(COMMAND, input=source, text=True, capture_output=True, check=True, timeout=15)
    return result.stdout.strip()


def call(action, ref, first=False):
    return sql(f"""begin;
      set local application_name='tll-integrity-{'first' if first else 'second'}';
      set local role authenticated;
      set local request.jwt.claim.sub='{USER}';
      select 'POINTS:' || public.award_points('{action}', '{ref}');
      {'select pg_sleep(2);' if first else ''}
      commit;""")


def pair(action, first_ref, second_ref, expected):
    # Each case is clean, synthetic and limited to one fixture/action.
    sql(f"delete from public.points_ledger where user_id='{USER}' and action_type='{action}';"
        f"delete from public.share_claims where user_id='{USER}';"
        f"update public.profiles set total_points=0 where id='{USER}';")
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        first = pool.submit(call, action, first_ref, True)
        deadline = time.monotonic() + 5
        while sql("select exists(select 1 from pg_stat_activity where application_name='tll-integrity-first' and wait_event='PgSleep');") != 't':
            if first.done() or time.monotonic() > deadline:
                raise AssertionError(f'First transaction did not reach lock-holding barrier: {first.result()}')
            time.sleep(.03)
        second = pool.submit(call, action, second_ref)
        results = [first.result(), second.result()]
    awards = [int(line.split(':')[1]) for result in results for line in result.splitlines() if line.startswith('POINTS:')]
    assert awards == [expected, 0], (action, awards)
    assert sql(f"select count(*) || ':' || sum(points) from public.points_ledger where user_id='{USER}' and action_type='{action}';") == f'1:{expected}'
    assert sql(f"select total_points from public.profiles where id='{USER}';") == str(expected)
    if action == 'share':
        assert sql(f"select count(*) from public.share_claims where user_id='{USER}';") == '1'
    print(f'PASS: concurrent {action} {awards}; one ledger credit, reconciled profile balance')
    sql(f"delete from public.points_ledger where user_id='{USER}' and action_type='{action}';"
        f"delete from public.share_claims where user_id='{USER}';"
        f"update public.profiles set total_points=0 where id='{USER}';")


assert sql('select current_database();') == 'tll_stage0'
assert sql(f"select email from auth.users where id='{USER}';") == 'fixture_b@example.invalid'
pair('daily_login', 'attacker-reference-a', 'attacker-reference-b', 5)
pair('share', PRODUCT, PRODUCT, 25)
