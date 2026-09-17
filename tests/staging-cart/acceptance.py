"""Actual PG17, one newly created local DB only. No hosted endpoint/credentials."""
import concurrent.futures
import json
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = 'tll-stage0-postgres'
DB = 'tll_staging_cart'
MIGRATOR = 'tll_cart_test_migrator'
ROLES = ['tll_cart_owner', 'tll_cart_gateway', 'tll_cart_role_setup', MIGRATOR]
CHECKS = []


def sql(text, database=DB, role=None, failure=False):
    prefix = ('set session authorization ' + role + ';\n') if role else ''
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'],
                            input=prefix+text, capture_output=True, text=True, timeout=30)
    if failure:
        assert result.returncode != 0, 'Expected SQL denial, got: '+result.stdout[:1500]
        return result.stderr
    assert result.returncode == 0, result.stderr[-1500:]
    return result.stdout.strip()


def literal(value):
    return "'"+str(value).replace("'", "''")+"'"


def rpc(name, *args, role='tll_cart_gateway', failure=False):
    values=','.join('null' if v is None else literal(json.dumps(v))+'::jsonb' if isinstance(v, dict) else str(v) if isinstance(v,int) else literal(v) for v in args)
    output=sql('select public.tll_cart_'+name+'('+values+');',role=role,failure=failure)
    return output if failure else json.loads(output) if output else None


def check(name, condition):
    assert condition, name
    CHECKS.append(name)


class Barrier:
    """A real, unchanged row/advisory lock; no sleep guesses establish ordering."""
    def __init__(self, statement, commit=False):
        self.commit = commit
        self.process = subprocess.Popen(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1'],
                                        stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.process.stdin.write("set statement_timeout='15s'; begin; " + statement + "; select 'barrier-ready';\n")
        self.process.stdin.flush()
        while True:
            line = self.process.stdout.readline()
            assert line, 'Lock barrier exited before acquiring its lock'
            if line.strip() == 'barrier-ready': break

    def release(self):
        if self.process.poll() is None:
            self.process.stdin.write('commit;\n' if self.commit else 'rollback;\n')
            self.process.stdin.flush()
            self.process.communicate(timeout=20)
            assert self.process.returncode == 0, 'Lock barrier failed'


def until(predicate, message):
    deadline = time.monotonic() + 10
    while not predicate():
        assert time.monotonic() < deadline, message
        time.sleep(0.02)


def queued_rpc(statement, barrier, before_release, failure=False, role='tll_cart_gateway'):
    label = 'cart-race-' + uuid.uuid4().hex
    with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
        pending = pool.submit(sql, "set application_name="+literal(label)+"; set statement_timeout='15s'; "+statement, role=role, failure=failure)
        try:
            until(lambda: sql('select exists(select from pg_stat_activity where datname='+literal(DB)+' and application_name='+literal(label)+" and wait_event_type='Lock' and cardinality(pg_blocking_pids(pid))>0);") == 't',
                  'RPC did not reach its lock barrier')
            before_release()
        finally:
            barrier.release()
        return pending.result(timeout=20)


def expiry_races(actor, envelope, lock='session'):
    results = []
    for method in ['read', 'claim', 'finish']:
        session = uuid.uuid4().hex * 2
        rpc('open', session, actor)
        request = str(uuid.uuid4())
        if method == 'finish': rpc('claim', session, actor, request, 'd'*64, 0, 1)
        sql("update tll_cart_private.sessions set expires_at=clock_timestamp()+interval '2 seconds' where session_hash="+literal(session)+';')
        barrier = Barrier('select enabled from tll_cart_private.control for update' if lock == 'control' else
                          'select session_hash from tll_cart_private.sessions where session_hash='+literal(session)+' for update')
        args = literal(session)+','+literal(actor)
        if method == 'claim': args += ','+literal(request)+','+literal('d'*64)+',0,1'
        if method == 'finish': args += ','+literal(request)+",'ready',"+literal(json.dumps(envelope))+'::jsonb,1,1200,1200'
        result = queued_rpc('select public.tll_cart_'+method+'('+args+');', barrier,
                            lambda: until(lambda: sql('select expires_at<=clock_timestamp() from tll_cart_private.sessions where session_hash='+literal(session)+';') == 't', 'Session did not expire'))
        results.append((method, result))
    assert all(result == '' for _, result in results), 'Stale expiry decisions: '+str(results)
    for method, _ in results:
        check(method+' rechecks expiry after a confirmed '+lock+' lock wait', True)


def disable_races(actor):
    for method in ['claim', 'open', 'read', 'finish']:
        session = uuid.uuid4().hex * 2
        request = str(uuid.uuid4())
        if method != 'open': rpc('open', session, actor)
        if method == 'finish': rpc('claim', session, actor, request, 'd'*64, 0, 1)
        before = sql('select row_to_json(s) from tll_cart_private.sessions s where session_hash='+literal(session)+';')
        args = literal(session)+','+literal(actor)
        if method == 'claim': args += ','+literal(request)+','+literal('d'*64)+',0,1'
        if method == 'finish': args += ','+literal(request)+",'held',null,null,null,null"
        barrier = Barrier('select pg_advisory_xact_lock(706006)' if method == 'open' else
                          'select session_hash from tll_cart_private.sessions where session_hash='+literal(session)+' for update')
        try:
            denied = queued_rpc('select public.tll_cart_'+method+'('+args+');', barrier,
                                lambda: sql('update tll_cart_private.control set enabled=false;'), failure=True)
            check(method+' waiting on its resource rejects a committed operator disable', 'Staging cart repository unavailable' in denied and
                  sql('select row_to_json(s) from tll_cart_private.sessions s where session_hash='+literal(session)+';') == before)
        finally:
            sql('update tll_cart_private.control set enabled=true;')


def control_commit_barrier(actor):
    session = uuid.uuid4().hex * 2
    rpc('open', session, actor)
    request = str(uuid.uuid4())
    barrier = Barrier('set local role tll_cart_gateway; select public.tll_cart_claim('+literal(session)+','+literal(actor)+','+
                      literal(request)+','+literal('d'*64)+',0,1)', commit=True)
    try:
        queued_rpc('update tll_cart_private.control set enabled=false;', barrier, lambda: None, role=MIGRATOR)
        check('operator disable waits for an admitted reservation to commit', sql('select phase from tll_cart_private.sessions where session_hash='+literal(session)+';') == 'working' and
              sql('select enabled from tll_cart_private.control;') == 'f')
    finally:
        sql('update tll_cart_private.control set enabled=true;')


def pending_disable(actor):
    session = uuid.uuid4().hex * 2
    opened = rpc('open', session, actor)
    request = str(uuid.uuid4())
    barrier = Barrier('update tll_cart_private.control set enabled=false', commit=True)
    try:
        denied = queued_rpc('select public.tll_cart_claim('+literal(session)+','+literal(actor)+','+literal(request)+','+literal('d'*64)+',0,1);',
                            barrier, lambda: None, failure=True)
        check('claim waiting on the control row observes the newly committed disable', 'Staging cart repository unavailable' in denied and
              json.loads(sql('select tll_cart_private.snapshot(s) from tll_cart_private.sessions s where session_hash='+literal(session)+';')) == opened)
    finally:
        sql('update tll_cart_private.control set enabled=true;')


def main():
    assert not sql("select datname from pg_database where datname='"+DB+"';",'postgres'), 'Existing DB is not replaced'
    assert not sql("select rolname from pg_roles where rolname in ("+','.join(literal(r)for r in ROLES)+');','postgres'), 'Existing roles are not modified'
    created=False
    marker='tll-cart-policy-proof:'+str(uuid.uuid4())
    try:
        sql('create database '+DB+';','postgres');created=True
        sql('comment on database '+DB+' is '+literal(marker)+';','postgres')
        sql('create role '+MIGRATOR+' nologin createrole noinherit; alter database '+DB+' owner to '+MIGRATOR+';')
        sql("create schema tll_staging_private; revoke all on schema tll_staging_private from public; create table tll_staging_private.environment(singleton boolean primary key,environment text,operator_project_ref text,identity_basis text); insert into tll_staging_private.environment values(true,'tll-hosted-staging-v1','abcdefghijklmnopqrst','explicit-operator-dashboard-binding'); grant usage on schema tll_staging_private to "+MIGRATOR+'; grant select on tll_staging_private.environment to '+MIGRATOR+';')
        migration=(ROOT/'supabase/migrations/202609150006_staging_cart_sessions.sql').read_text()
        error=sql(migration,role=MIGRATOR,failure=True)
        check('missing explicit staging context rejects migration atomically','Explicit staging context required' in error and not sql("select to_regnamespace('tll_cart_private');"))
        sql("set tll.cart_migration_environment='staging'; set tll.cart_expected_project_ref='abcdefghijklmnopqrst';\n"+migration,role=MIGRATOR)
        check('managed-style non-superuser PG17 migration succeeds',sql("select rolsuper from pg_roles where rolname='"+MIGRATOR+"';")=='f')
        check('control stays disabled and gateway is not provisioned',sql("select enabled from tll_cart_private.control;")=='f' and sql("select count(*) from pg_auth_members where roleid='tll_cart_owner'::regrole and member='"+MIGRATOR+"'::regrole and grantor='postgres'::regrole and admin_option and not inherit_option and not set_option;")=='1' and sql("select count(*) from pg_auth_members where roleid='tll_cart_gateway'::regrole and member='"+MIGRATOR+"'::regrole and admin_option and not inherit_option and not set_option;")=='1')
        check('installing operator retains ADMIN only, not inherited gateway authority or SET ROLE',sql("select pg_has_role(current_user,'tll_cart_gateway','USAGE') or pg_has_role(current_user,'tll_cart_gateway','SET');",role=MIGRATOR)=='f' and 'permission denied' in sql('set role tll_cart_gateway;',role=MIGRATOR,failure=True))
        check('owner administration does not grant default function use or SET authority',sql("select pg_has_role(current_user,'tll_cart_owner','USAGE') or pg_has_role(current_user,'tll_cart_owner','SET') or has_function_privilege(current_user,'public.tll_cart_open(text,text)','EXECUTE');",role=MIGRATOR)=='f' and 'must be owner' in sql('alter function public.tll_cart_open(text,text) cost 101;',role=MIGRATOR,failure=True))
        upgrade="""begin;
grant tll_cart_owner to """+MIGRATOR+""" with admin false,inherit false,set true;
grant create on schema public,tll_cart_private to tll_cart_owner;
set local role tll_cart_owner;
alter function public.tll_cart_open(text,text) cost 101;
do $$begin execute pg_get_functiondef('public.tll_cart_open(text,text)'::regprocedure); execute pg_get_functiondef('tll_cart_private.snapshot(tll_cart_private.sessions)'::regprocedure); end$$;
select procost=101 from pg_proc where oid='public.tll_cart_open(text,text)'::regprocedure;
reset role;
revoke create on schema public,tll_cart_private from tll_cart_owner;
revoke tll_cart_owner from """+MIGRATOR+""" granted by """+MIGRATOR+""";
select count(*)=1 and bool_and(grantor='postgres'::regrole and admin_option and not inherit_option and not set_option) from pg_auth_members where roleid='tll_cart_owner'::regrole;
select not(pg_has_role(current_user,'tll_cart_owner','USAGE') or pg_has_role(current_user,'tll_cart_owner','SET') or has_function_privilege(current_user,'public.tll_cart_open(text,text)','EXECUTE'));
rollback;"""
        check('future function migration explicitly acquires and retires scoped owner authority',sql(upgrade,role=MIGRATOR)=='t\nt\nt' and sql("select procost from pg_proc where oid='public.tll_cart_open(text,text)'::regprocedure;")=='100')
        super_proof="""begin;
drop function public.tll_cart_open(text,text),public.tll_cart_read(text,text),public.tll_cart_claim(text,text,uuid,text,bigint,integer),public.tll_cart_finish(text,text,uuid,text,jsonb,integer,integer,integer);
drop schema tll_cart_private cascade;
revoke usage on schema public from tll_cart_gateway;
drop role tll_cart_owner; drop role tll_cart_gateway;
set local tll.cart_migration_environment='staging'; set local tll.cart_expected_project_ref='abcdefghijklmnopqrst';
"""+migration.replace('begin;\n','',1).removesuffix('commit;\n')+"""
select count(*)=2 and bool_and(member=current_user::regrole and grantor=current_user::regrole and admin_option and not inherit_option and not set_option) from pg_auth_members where roleid in('tll_cart_owner'::regrole,'tll_cart_gateway'::regrole);
rollback;"""
        check('superuser installation retires its single self-granted edges to ADMIN only',sql(super_proof)=='t' and sql("select operator_oid='"+MIGRATOR+"'::regrole from tll_cart_private.control;")=='t')
        provision="""begin;
create role tll_cart_provisioning_probe nologin nosuperuser nobypassrls nocreaterole nocreatedb noreplication;
grant tll_cart_gateway to tll_cart_provisioning_probe with inherit true,set false;
select has_function_privilege('tll_cart_provisioning_probe','public.tll_cart_open(text,text)','EXECUTE') and not has_schema_privilege('tll_cart_provisioning_probe','tll_cart_private','USAGE');
revoke tll_cart_gateway from tll_cart_provisioning_probe;
select not has_function_privilege('tll_cart_provisioning_probe','public.tll_cart_open(text,text)','EXECUTE');
rollback;"""
        check('nonsuperuser operator can grant and revoke a separate runtime within rollback-only proof',sql(provision,role=MIGRATOR)=='t\nt' and sql("select count(*) from pg_roles where rolname='tll_cart_provisioning_probe';")=='0')
        session='a'*64;actor='b'*64
        check('disabled repository cannot create session','Staging cart repository unavailable' in rpc('open',session,actor,failure=True) and sql('select count(*) from tll_cart_private.sessions;')=='0')
        for role in ['anon','authenticated','service_role']:
            check(role+' cannot call cart RPC','permission denied' in rpc('open',session,actor,role=role,failure=True))
            check(role+' cannot access private table','permission denied' in sql('select * from tll_cart_private.sessions;',role=role,failure=True))
        check('gateway cannot access private table or enable control','permission denied' in sql('update tll_cart_private.control set enabled=true;',role='tll_cart_gateway',failure=True))
        check('function owner can lock control but RLS rejects actual control updates',sql('begin; select enabled from tll_cart_private.control for share; rollback;',role='tll_cart_owner')=='f' and
              'row-level security policy' in sql('update tll_cart_private.control set enabled=true;',role='tll_cart_owner',failure=True))
        for method, args in [('open', literal(session)+','+literal(actor)), ('read', literal(session)+','+literal(actor)),
                             ('claim', literal(session)+','+literal(actor)+','+literal(str(uuid.uuid4()))+','+literal('d'*64)+',0,1'),
                             ('finish', literal(session)+','+literal(actor)+','+literal(str(uuid.uuid4()))+",'held',null,null,null,null")]:
            error = sql('begin; delete from tll_cart_private.control; set local role tll_cart_gateway; select public.tll_cart_'+method+'('+args+');', failure=True)
            check(method+' fails closed when the control row is missing', 'Staging cart repository unavailable' in error and sql('select count(*) from tll_cart_private.control;') == '1')
        sql('update tll_cart_private.control set enabled=true;')
        opened=rpc('open',session,actor)
        check('empty session created once with private context',opened['revision']==0 and opened['envelope'] is None and rpc('open',session,actor)==opened)
        check('wrong identity cannot read or open old cart',rpc('read',session,'c'*64) is None and rpc('open',session,'c'*64) is None)
        sql('update tll_cart_private.control set enabled=false;')
        paused=rpc('read',session,actor,failure=True)
        sql('update tll_cart_private.control set enabled=true;')
        check('operator pause is an unavailable repository, not a missing or replaced cart','Staging cart repository unavailable' in paused and rpc('read',session,actor)==opened)
        request=str(uuid.uuid4());claim=rpc('claim',session,actor,request,'d'*64,0,1)
        check('durable claim precedes external work',claim['status']=='claimed' and claim['record']['phase']=='working')
        check('duplicate request is replay and conflicting content is rejected',rpc('claim',session,actor,request,'d'*64,0,1)['status']=='replay' and rpc('claim',session,actor,request,'e'*64,0,1)['status']=='conflict')
        check('new nonce cannot bypass pending create',rpc('claim',session,actor,str(uuid.uuid4()),'e'*64,0,1)['status']=='held')
        bad={'cartId':'gid://shopify/Cart/synthetic?key=not-real'}
        check('plaintext cart ID cannot be persisted','Invalid cart projection' in rpc('finish',session,actor,request,'ready',bad,1,1200,1200,failure=True))
        envelope={'v':1,'alg':'A256GCM','kid':'cart-v1','iv':'A'*16,'tag':'B'*22,'ciphertext':'C'*48}
        finished=rpc('finish',session,actor,request,'ready',envelope,1,1200,1200)
        check('acknowledged result advances revision once',finished['revision']==1 and finished['quantity']==1 and rpc('finish',session,actor,request,'ready',envelope,1,1200,1200)==finished)
        check('stale edits cannot overwrite latest cart',rpc('claim',session,actor,str(uuid.uuid4()),'f'*64,0,2)['status']=='conflict')
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            ids=[str(uuid.uuid4()),str(uuid.uuid4())]
            results=list(pool.map(lambda item:rpc('claim',session,actor,item,'f'*64,1,2),ids))
        check('concurrent workers have one reservation only',sorted(r['status']for r in results)==['claimed','held'])
        pending=rpc('read',session,actor)['operationId'];held=rpc('finish',session,actor,pending,'held',None,None,None,None)
        check('unknown write preserves known encrypted cart and cannot reopen',held['phase']=='held' and held['envelope']==envelope and held['quantity']==1 and rpc('claim',session,actor,str(uuid.uuid4()),'f'*64,1,3)['status']=='held')
        second='e'*64;rpc('open',second,actor);late=str(uuid.uuid4());rpc('claim',second,actor,late,'d'*64,0,1)
        sql("update tll_cart_private.sessions set lease_until=clock_timestamp()-interval '1 second' where session_hash="+literal(second)+';')
        check('process death expires to hold without replay',rpc('read',second,actor)['phase']=='held')
        check('late acknowledgement cannot release expired reservation',rpc('finish',second,actor,late,'ready',envelope,1,1200,1200)['phase']=='held')
        expiry_races(actor, envelope)
        expiry_races(actor, envelope, lock='control')
        disable_races(actor)
        control_commit_barrier(actor)
        pending_disable(actor)
        check('all private tables have RLS and gateway has no direct table grants',sql("select bool_and(relrowsecurity) from pg_class where relnamespace='tll_cart_private'::regnamespace and relkind='r';")=='t' and sql("select has_table_privilege('tll_cart_gateway','tll_cart_private.sessions','SELECT,INSERT,UPDATE,DELETE');")=='f')
        print(json.dumps({'status':'pass','checks':CHECKS,'count':len(CHECKS),'transport':'local docker exec / new isolated PG17 DB only','hostedCalls':False},indent=2))
    finally:
        if created:
            # This invocation created the entire named DB, and never adopts an
            # existing DB. Original fixture databases/services remain untouched.
            assert sql("select shobj_description(oid,'pg_database') from pg_database where datname=current_database();")==marker, 'Cleanup requires this invocation marker'
            sql('drop database '+DB+';','postgres')
            for role in ROLES:
                sql('drop role if exists '+role+';','postgres')


if __name__=='__main__':main()
