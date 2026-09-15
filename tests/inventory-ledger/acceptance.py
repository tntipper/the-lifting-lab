"""Real PG17 tests. Only a marked local synthetic DB via docker exec; no sockets/URLs."""
import concurrent.futures
import copy
import hashlib
import json
import os
import re
import subprocess
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CONTAINER = os.environ.get('TLL_INVENTORY_TEST_CONTAINER', '')
if CONTAINER != 'tll-stage0-postgres' and not re.fullmatch(r'tll-inventory-ci-[1-9][0-9]*', CONTAINER):
    raise SystemExit('Non-allowlisted local container')
DB = 'tll_inventory_ledger'
P = 'tll_inventory_private.'
MIGRATOR = 'tll_inventory_test_migrator'
A = 'tll_inventory_test_worker_a'
B = 'tll_inventory_test_worker_b'
WA = '72000000-0000-4000-8000-000000000001'
WB = '72000000-0000-4000-8000-000000000002'
GROUP = 'gid://shopify/InventoryAdjustmentGroup/synthetic'
MIGRATION = (ROOT / 'supabase/migrations/202609150004_inventory_operation_ledger.sql').read_text()
CHECKS = 0

def execute(sql, role=None, error=None):
    prefix = f'SET SESSION AUTHORIZATION {role};\n' if role else ''
    call = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', DB, '-v', 'ON_ERROR_STOP=1'],
                          input=prefix + sql, text=True, capture_output=True, timeout=30)
    if error is not None:
        assert call.returncode != 0 and error in call.stderr, call.stderr[-3000:]
        return None
    if call.returncode != 0:
        raise AssertionError(call.stderr[-3000:])
    return call.stdout.strip()

def check(name, actual=True, expected=True):
    global CHECKS
    assert actual == expected, f'{name}: expected {expected!r}; got {actual!r}'
    CHECKS += 1
    print(f'PASS {name}', flush=True)

def literal(v):
    if v is None:
        return 'null'
    if isinstance(v, (dict, list)):
        v = compact(v)
    return "'" + str(v).replace("'", "''") + "'"

def compact(v):
    return json.dumps(v, separators=(',', ':'), ensure_ascii=False)

def call(name, *args, role=A):
    result = execute('select ' + P + name + '(' + ','.join(map(literal, args)) + ');', role)
    return json.loads(result) if result else None

def fixture(target):
    result = subprocess.run(['node', '--experimental-strip-types', str(ROOT / 'tests/inventory-ledger/fixture.mjs'),
                             compact({'operationId': str(uuid.uuid4()), 'target': target})], capture_output=True, text=True, check=True)
    return json.loads(result.stdout)

def enqueue(f):
    return call('enqueue', compact(f['manifest']))

def claim(f, worker=WA, role=A, seconds=120):
    return call('claim', f['manifest']['plan']['operationId'], worker, seconds, role=role)

def begin(f, c, role=A):
    return call('begin_attempt', c['operation_id'], c['worker_id'], c['fence'], f['manifest']['plan']['requestHash'], role=role)

def reconcile(c, outcome='acknowledged', role=A):
    return call('begin_reconciliation', c['operation_id'], c['worker_id'], c['fence'], outcome, GROUP if outcome == 'acknowledged' else None, role=role)

def finish(f, c, token, result='hold', observation='fresh', role=A):
    if observation == 'fresh':
        observation = copy.deepcopy(f['observation'])
        observation['observedAtMs'] = int(time.time()*1000)
        observation['level']['available'] = f['manifest']['plan']['desiredAvailable']
    return call('finish_reconciliation', c['operation_id'], c['worker_id'], c['fence'], token, result, observation, role=role)

def expire(f):
    execute('update ' + P + 'operations set lease_until=clock_timestamp()-interval \'1 second\' where operation_id=' + literal(f['manifest']['plan']['operationId']) + ';')

def rehash(m):
    m['plan']['bindingHash'] = hashlib.sha256(compact(m['binding']).encode()).hexdigest()
    m['requestDocument'] = compact({'endpoint': m['endpoint'], 'body': m['plan']['request']})
    m['plan']['requestHash'] = hashlib.sha256(m['requestDocument'].encode()).hexdigest()
    return m

# Prove marker BEFORE the reset can run. Existing local fixture was explicitly approved.
check('marked dedicated local database', execute("select current_database()||':'||marker from public.tll_inventory_test_marker;"), DB + ':synthetic-inventory-ledger-v1')
execute((ROOT / 'tests/inventory-ledger/bootstrap.sql').read_text())
# Regression uses SESSION AUTHORIZATION, not SET ROLE: postgres must not mask owner SET privileges.
execute(MIGRATION, MIGRATOR)
check('non-superuser migration installed disabled', execute('select enabled from ' + P + 'control;'), 'f')
execute(f'create role {A} nologin; create role {B} nologin; grant tll_inventory_worker to {A},{B};')
check('migration leaves no helper/owner membership or owner CREATE', execute("select not exists(select from pg_roles where rolname='tll_inventory_role_setup') and not exists(select from pg_auth_members where roleid='tll_inventory_owner'::regrole or member='tll_inventory_owner'::regrole) and not has_schema_privilege('tll_inventory_owner','tll_inventory_private','CREATE');"), 't')
for role in [MIGRATOR, A, B, 'anon', 'authenticated', 'service_role']:
    execute('set role tll_inventory_owner;', role, error='permission denied')
    check('owner SET denied for ' + role)
for role in ['anon', 'authenticated', 'service_role']:
    execute('select ' + P + 'inspect_operation(null);', role, error='permission denied')
    execute('set role tll_inventory_worker;', role, error='permission denied')
    check('private schema and worker SET denied for ' + role)
for statement in ['select * from '+P+'operations;', 'update '+P+'control set enabled=true;', 'select '+P+"cancel_never_attempted(null,null);", 'create table '+P+'forged(id int);']:
    execute(statement, A, error='permission denied')
    check('worker cannot access table, activation, cancellation or DDL: ' + statement.split()[0])
check('API roles have no effective table/column/function grants', execute("select not exists(select from pg_roles r cross join pg_class c where r.rolname in ('anon','authenticated','service_role') and c.relnamespace='tll_inventory_private'::regnamespace and (has_table_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or has_any_column_privilege(r.oid,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) and not exists(select from pg_roles r cross join pg_proc p where r.rolname in ('anon','authenticated','service_role') and p.pronamespace='tll_inventory_private'::regnamespace and has_function_privilege(r.oid,p.oid,'EXECUTE'));"), 't')

f = fixture(1)
check('valid adapter manifest enqueued', enqueue(f)['status'], 'enqueued')
check('exact idempotent enqueue', enqueue(f)['status'], 'existing')
check('default disabled prevents claim', claim(f)['status'], 'disabled')
changed = copy.deepcopy(f); changed['manifest']['provenance']['supplierSku'] = 'changed-provenance'
check('same operation changed evidence conflicts', enqueue(changed)['status'], 'operation_conflict')
check('second operation same outstanding target denied', enqueue(fixture(1))['status'], 'target_busy')
renamed=fixture(1); renamed['manifest']['binding']['shopDomain']='renamed-synthetic-inventory.myshopify.com'
renamed['manifest']['endpoint']='https://renamed-synthetic-inventory.myshopify.com/admin/api/2026-07/graphql.json'
rehash(renamed['manifest'])
check('shop hostname change cannot bypass stable shop/item/location exclusion', enqueue(renamed)['status'], 'target_busy')

# Reject tampering even after recomputing hashes, plus nested duplicate/null/structural cases.
base = f['manifest']
mutations = {
    'null review': lambda m: m['binding'].__setitem__('review', None),
    'false approval': lambda m: m['provenance']['policyReview'].__setitem__('approved', False),
    'object version': lambda m: m['provenance']['stockReview'].update(version={}, expectedVersion={}),
    'unbound stock version': lambda m: m['plan'].__setitem__('stockVersion', 'different'),
    'object formula identity': lambda m: m['provenance']['formulaIdentity'].__setitem__(0, {'token':'synthetic'}),
    'null CAS': lambda m: m['plan']['request']['variables']['input']['quantities'][0].__setitem__('changeFromQuantity', None),
    'string CAS': lambda m: m['plan']['request']['variables']['input']['quantities'][0].__setitem__('changeFromQuantity', '4'),
    'out of range quantity': lambda m: (m['plan'].__setitem__('desiredAvailable', 2147483648), m['plan']['request']['variables']['input']['quantities'][0].__setitem__('quantity', 2147483648)),
    'wrong target': lambda m: m['plan']['request']['variables']['input']['quantities'][0].__setitem__('inventoryItemId', 'gid://shopify/InventoryItem/999'),
    'changed query': lambda m: m['plan']['request'].__setitem__('query', 'mutation { productDelete }'),
    'extra secret header': lambda m: m['plan']['request'].__setitem__('headers', {'authorization':'synthetic'}),
    'host override': lambda m: m.__setitem__('endpoint', 'https://example.invalid/admin/api/2026-07/graphql.json'),
    'version fallback': lambda m: m['plan'].__setitem__('apiVersion', '2026-10'),
    'future evidence': lambda m: m['provenance'].__setitem__('stockObservedAtMs', m['plan']['createdAtMs']+1),
    'expired review': lambda m: m['provenance']['policyReview'].__setitem__('expiresAtMs', 1),
}
for name, mutate in mutations.items():
    m = copy.deepcopy(base); mutate(m); rehash(m)
    check('invalid manifest ' + name, call('enqueue', compact(m))['status'], 'invalid')
for name, document in [('truncated', compact(base)[:-3]), ('duplicate nested key', compact(base).replace('"approved":true', '"approved":true,"approved":true', 1)), ('JSON null', 'null'), ('oversize', ' '*32769), ('wrong hash', compact(base).replace(base['plan']['requestHash'], '0'*64))]:
    check('invalid manifest ' + name, call('enqueue', document)['status'], 'invalid')
# Valid signed-by-hash manifest can still be expired without refreshing provenance.
m = copy.deepcopy(base)
delta = 7200000
for review in [m['binding']['review'], m['provenance']['policyReview'], m['provenance']['mappingReview'], m['provenance']['stockReview']]:
    review['verifiedAtMs'] -= delta; review['expiresAtMs'] -= delta
for key in ['createdAtMs','expiresAtMs']:
    m['plan'][key] -= delta
for key in ['stockObservedAtMs','readObservedAtMs']:
    m['provenance'][key] -= delta
m['plan']['operationId'] = str(uuid.uuid4()); m['plan']['request']['variables']['idempotencyKey'] = m['plan']['operationId']; m['plan']['request']['variables']['input']['referenceDocumentUri'] = 'gid://tll/InventorySync/'+m['plan']['operationId']; rehash(m)
check('expired persisted plan rejected', call('enqueue', compact(m))['status'], 'expired')
execute('delete from '+P+'control;')
check('missing activation row fails closed', claim(f)['status'], 'disabled')
execute('insert into '+P+'control(singleton,enabled) values(true,true);')
c = claim(f)
check('fresh first claim', (c['status'], c['mode'], c['fence']), ('claimed','first_attempt','1'))
check('current lease excludes other worker', claim(f,WB,B)['status'], 'unavailable')
check('wrong worker cannot attempt', call('begin_attempt',c['operation_id'],WB,c['fence'],base['plan']['requestHash'],role=B)['status'], 'fenced')
check('wrong request hash cannot attempt', call('begin_attempt',c['operation_id'],WA,c['fence'],'0'*64)['status'], 'fenced')
execute('update ' + P + 'control set enabled=false;')
check('kill switch prevents leased attempt', begin(f,c)['status'], 'disabled')
execute('update ' + P + 'control set enabled=true;')
check('durable attempt transition', begin(f,c)['status'], 'attempt_committed')
check('duplicate attempt is fenced', begin(f,c)['status'], 'fenced')
r = reconcile(c)
check('acknowledgement requires own attempt', r['status'], 'reconciling')
check('stale pre-attempt read cannot complete', finish(f,c,r['reconcile_token'],'reconciled',f['observation'])['status'], 'invalid')
for name, mutate in {
    'unknown level': lambda o:o.__setitem__('level',None),
    'nested extra fields': lambda o:o['level'].__setitem__('token','synthetic'),
    'missing active': lambda o:o['level'].pop('active'),
    'wrong variant': lambda o:o.__setitem__('linkedVariantIds',['gid://shopify/ProductVariant/999']),
    'future snapshot': lambda o:o.__setitem__('observedAtMs',int(time.time()*1000)+60000),
    'unknown status': lambda o:o.__setitem__('productStatus',None),
    'string quantity': lambda o:o['level'].__setitem__('available','7'),
}.items():
    o = copy.deepcopy(f['observation']); o['level']['available']=7; o['observedAtMs']=int(time.time()*1000); mutate(o)
    check('cannot complete with ' + name, finish(f,c,r['reconcile_token'],'reconciled',o)['status'], 'invalid')
check('acknowledged fresh matching read completes', finish(f,c,r['reconcile_token'],'reconciled')['status'], 'completed')
check('completed target admits a newly reviewed operation', enqueue(fixture(1))['status'], 'enqueued')

# Crashes before outbound boundary must also require a new issued in-memory plan.
f2=fixture(2); enqueue(f2); c2=claim(f2); expire(f2); recovered=claim(f2,WB,B)
check('claim crash increments fence and only allows reconciliation', (recovered['mode'],recovered['fence'],recovered['attempted']), ('reconcile_only','2',False))
check('expired original worker cannot attempt', begin(f2,c2)['status'], 'fenced')
check('recovered worker cannot attempt', begin(f2,recovered,B)['status'], 'fenced')
check('recovered unsent operation held after read', finish(f2,recovered,recovered['reconcile_token'],role=B)['status'], 'held')
check('held target prevents new operation', enqueue(fixture(2))['status'], 'target_busy')
check('operator releases only never-attempted held work', call('cancel_never_attempted',c2['operation_id'],str(uuid.uuid4()),role=MIGRATOR)['status'], 'cancelled')
check('reviewed new operation after unsent cancellation allowed', enqueue(fixture(2))['status'], 'enqueued')
# Crash after attempt marker: even desired quantity and old acknowledgement cannot resolve it automatically.
f3=fixture(3);enqueue(f3);c3=claim(f3);begin(f3,c3);r3=reconcile(c3);expire(f3);c3b=claim(f3,WB,B)
check('attempt crash remains possibly sent across fences', (c3b['mode'],c3b['attempted']), ('reconcile_only',True))
check('late original acknowledgement fenced', reconcile(c3)['status'], 'fenced')
check('late original completion fenced', finish(f3,c3,r3['reconcile_token'],'reconciled')['status'], 'fenced')
check('new fence cannot reuse old acknowledgement', finish(f3,c3b,c3b['reconcile_token'],'reconciled',role=B)['status'], 'invalid')
check('desired state alone remains held', finish(f3,c3b,c3b['reconcile_token'],role=B)['status'], 'held')
check('operator cannot cancel possibly-sent work', call('cancel_never_attempted',c3['operation_id'],str(uuid.uuid4()),role=MIGRATOR)['status'], 'unavailable')
check('possibly-sent held target stays locked', enqueue(fixture(3))['status'], 'target_busy')
# Malformed acknowledgements and token mismatches.
f4=fixture(4);enqueue(f4);c4=claim(f4)
check('cannot acknowledge before attempt', reconcile(c4)['status'], 'invalid')
begin(f4,c4)
check('cannot erase an attempt as not_sent', reconcile(c4,'not_sent')['status'], 'invalid')
check('malformed group ID denied', call('begin_reconciliation',c4['operation_id'],WA,c4['fence'],'acknowledged','https://example.invalid')['status'], 'invalid')
r4=reconcile(c4,'unknown')
check('wrong reconciliation token fenced', finish(f4,c4,str(uuid.uuid4()))['status'], 'fenced')
check('uncertain outcome cannot complete from desired quantity', finish(f4,c4,r4['reconcile_token'],'reconciled')['status'], 'invalid')
check('failed reread stores honest null and holds', finish(f4,c4,r4['reconcile_token'],observation=None)['status'], 'held')
# Direct immutable-evidence tampering by the table operator is rejected.
for statement in [f"update {P}operations set request_hash=repeat('0',64) where operation_id={literal(c4['operation_id'])};",f"delete from {P}operations where operation_id={literal(c4['operation_id'])};",f"update {P}events set event_name='forged';",f"delete from {P}events;"]:
    execute(statement,error='inventory')
    check('immutable evidence refuses '+statement.split()[0]+' '+statement.split()[1])

# Actual concurrent sessions: lock+SKIP LOCKED and target uniqueness, not mocked callbacks.
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    racers=[fixture(10) for _ in range(6)]
    results=list(pool.map(enqueue,racers))
    check('six concurrent enqueues yield one target owner', sorted(r['status'] for r in results), ['enqueued']+['target_busy']*5)
    winner=racers[next(i for i,r in enumerate(results) if r['status']=='enqueued')]
    results=list(pool.map(lambda _:claim(winner),range(6)))
    check('six concurrent claims yield one lease', sorted(r['status'] for r in results), ['claimed']+['unavailable']*5)
    duplicate=fixture(11)
    results=list(pool.map(lambda _:enqueue(duplicate),range(6)))
    check('six concurrent identical enqueues are idempotent', sorted(r['status'] for r in results), ['enqueued']+['existing']*5)

# Wait on a row lock past expiry. A timestamp captured BEFORE locking must not authorise a send.
f12=fixture(12);enqueue(f12);c12=claim(f12,seconds=1)
lock_sql=f"set application_name='tll-inventory-lease-lock'; begin; select operation_id from {P}operations where operation_id={literal(c12['operation_id'])} for update; select pg_sleep(1.6); commit;"
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    lock=pool.submit(execute,lock_sql)
    for _ in range(40):
        if execute("select exists(select from pg_stat_activity where datname='tll_inventory_ledger' and application_name='tll-inventory-lease-lock' and wait_event='PgSleep');")=='t':
            break
        time.sleep(.05)
    else:
        raise AssertionError('Synthetic lock barrier not reached')
    attempted=pool.submit(begin,f12,c12)
    lock.result()
    check('lease expiry while waiting on lock fences attempt',attempted.result()['status'],'fenced')

# Rollback-only inherited ACL probes. Schema/default table grants must abort the migration.
# Savepoint rollback removes the real schema+new roles only inside this transaction.
inner = re.sub(r'^begin;\n','',MIGRATION,flags=re.M)
inner = re.sub(r'\ncommit;\s*$','',inner)
for kind in ['schema','table']:
    sql="begin; drop schema tll_inventory_private cascade; drop owned by tll_inventory_owner,tll_inventory_worker; drop role tll_inventory_owner,tll_inventory_worker; create role tll_inventory_test_leak nologin; grant tll_inventory_test_leak to anon;\n"
    sql+=f"set session authorization {MIGRATOR};\n"
    if kind=='schema':
        sql+="alter default privileges grant usage on schemas to tll_inventory_test_leak;\n"
    else:
        sql+="alter default privileges grant select on tables to tll_inventory_test_leak;\n"
    sql+=inner+'\nrollback;'
    execute(sql,error='Inventory '+('authority inherited' if kind=='schema' else 'table authority inherited'))
    check('inherited default '+kind+' ACL aborts migration and rolls back',execute("select to_regnamespace('tll_inventory_private') is not null and not exists(select from pg_roles where rolname='tll_inventory_test_leak');"),'t')
print(f'PASS {CHECKS} real PostgreSQL checks (including concurrent/crash/ACL regressions); synthetic database only',flush=True)
