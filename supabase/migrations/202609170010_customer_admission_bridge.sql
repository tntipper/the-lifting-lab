-- Disabled LOCAL-reviewed admission bridge. No LOGIN, credential, provider or route.
-- Install after the maintainable-owner versions of 007 and 008, once only.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE r text; installer name:=current_user;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regprocedure('tll_broker_private.repository(text,jsonb)') IS NULL
   OR to_regprocedure('tll_provisional_private.repository(text,jsonb)') IS NULL
   OR to_regnamespace('tll_bridge_private') IS NOT NULL
   OR EXISTS(SELECT FROM pg_roles WHERE rolname IN ('tll_bridge_owner','tll_bridge_executor')) THEN
   RAISE EXCEPTION 'Admission bridge installation unavailable'; END IF;
 FOREACH r IN ARRAY ARRAY['tll_broker_owner','tll_provisional_owner'] LOOP
   IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) AND NOT EXISTS(SELECT FROM pg_auth_members
     WHERE roleid=r::regrole AND member=current_user::regrole AND admin_option AND NOT inherit_option AND NOT set_option) THEN
     RAISE EXCEPTION 'Reviewed owner upgrade authority required'; END IF;
   EXECUTE format('GRANT %I TO %I WITH INHERIT TRUE, SET TRUE',r,installer);
 END LOOP;
 IF (SELECT enabled FROM tll_broker_private.control) OR (SELECT enabled FROM tll_provisional_private.control) THEN
   RAISE EXCEPTION 'Disable both repositories before installation'; END IF;
 IF (SELECT operator_oid FROM tll_broker_private.control)<>current_user::regrole::oid
   OR (SELECT operator_oid FROM tll_provisional_private.control)<>current_user::regrole::oid THEN
   RAISE EXCEPTION 'Existing repository installer required'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_broker_private.repository(text,jsonb)'::regprocedure)<>'5eb6b29e2416753f6d13335e504009a7'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_provisional_private.repository(text,jsonb)'::regprocedure)<>'594359bf5e758ab5237d8a1d309cc175'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_broker_private.operator_set_enabled(boolean,text)'::regprocedure)<>'9909a542000b08afb421154b0cc45670'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='tll_provisional_private.operator_set_enabled(boolean,text)'::regprocedure)<>'3312c37295a65f2ba518a2c7fea1ae82' THEN
   RAISE EXCEPTION 'Reviewed repository function source required'; END IF;
 SET LOCAL createrole_self_grant='';
 CREATE ROLE tll_bridge_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 CREATE ROLE tll_bridge_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
 IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
   EXECUTE format('GRANT tll_bridge_owner,tll_bridge_executor TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',installer);
 END IF;
 EXECUTE format('GRANT tll_bridge_owner TO %I WITH INHERIT TRUE, SET TRUE',installer);
END
$preflight$;
CREATE SCHEMA tll_bridge_private AUTHORIZATION tll_bridge_owner;
CREATE TABLE tll_bridge_private.control(
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
 epoch bigint NOT NULL DEFAULT 1 CHECK(epoch>0), operator_oid oid NOT NULL,
 reason_code text NOT NULL DEFAULT 'installed_disabled', changed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO tll_bridge_private.control(singleton,operator_oid) VALUES(true,current_user::regrole::oid);
CREATE TABLE tll_bridge_private.grants(
 id uuid PRIMARY KEY, binding jsonb NOT NULL, source_snapshot jsonb NOT NULL,
 admission_operation uuid NOT NULL, admission_fence bigint NOT NULL, source_generation bigint NOT NULL,
 registration_operation uuid NOT NULL UNIQUE, outer_hash text NOT NULL UNIQUE,
 epoch bigint NOT NULL, expires_at timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN ('pending_browser','browser_admitted','held','cancelled')),
 release_hash text CHECK(release_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(state<>'pending_browser' OR release_hash IS NOT NULL)
);
CREATE TABLE tll_bridge_private.operations(
 id uuid PRIMARY KEY, transaction_id uuid NOT NULL, phase text NOT NULL CHECK(phase IN ('register','hold','cancel'))
);
ALTER TABLE tll_provisional_private.intents ADD COLUMN bridge_epoch bigint CHECK(bridge_epoch>0);
ALTER FUNCTION tll_broker_private.repository(text,jsonb) RENAME TO repository_v1;
ALTER FUNCTION tll_provisional_private.repository(text,jsonb) RENAME TO repository_v1;
ALTER FUNCTION tll_broker_private.operator_set_enabled(boolean,text) RENAME TO operator_set_enabled_v1;
ALTER FUNCTION tll_provisional_private.operator_set_enabled(boolean,text) RENAME TO operator_set_enabled_v1;

-- Fixed owner-held helpers; no executor can call them, select ciphertext or
-- obtain a cross-store role. All callers acquire G before these B/P locks.
CREATE FUNCTION tll_broker_private.bridge_lock() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE enabled boolean; BEGIN SELECT c.enabled INTO STRICT enabled FROM tll_broker_private.control c WHERE singleton FOR UPDATE; RETURN enabled; END $f$;
CREATE FUNCTION tll_provisional_private.bridge_lock() RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE enabled boolean; BEGIN SELECT c.enabled INTO STRICT enabled FROM tll_provisional_private.control c WHERE singleton FOR UPDATE; RETURN enabled; END $f$;
CREATE FUNCTION tll_bridge_private.gate() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE c tll_bridge_private.control%ROWTYPE; b boolean; p boolean;
BEGIN
 SELECT * INTO STRICT c FROM tll_bridge_private.control WHERE singleton FOR UPDATE;
 b:=tll_broker_private.bridge_lock(); p:=tll_provisional_private.bridge_lock();
 RETURN jsonb_build_object('enabled',c.enabled AND b AND p,'epoch',c.epoch::text);
END $f$;
CREATE FUNCTION tll_provisional_private.bridge_source(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE r tll_provisional_private.intents%ROWTYPE; a tll_provisional_private.operations%ROWTYPE;
BEGIN
 SELECT * INTO r FROM tll_provisional_private.intents WHERE id=(p->>'transactionId')::uuid;
 IF NOT FOUND OR r.browser_hash IS DISTINCT FROM p->>'browserHash' OR r.config_hash IS DISTINCT FROM p->>'configHash'
   OR r.intent_hash IS DISTINCT FROM p->>'intentHash' OR r.application_challenge IS DISTINCT FROM p->>'applicationPkceChallenge' THEN RETURN NULL; END IF;
 SELECT * INTO a FROM tll_provisional_private.operations WHERE id=(p->>'admissionOperationId')::uuid;
 RETURN jsonb_build_object('metadata',r.metadata,'state',r.state,'fence',r.fence::text,'generation',r.generation::text,
   'epoch',r.bridge_epoch::text,'outer',r.outer_request,'outerHash',r.outer_hash,
   'admissionCompleted',a.intent_id=r.id AND a.phase='admission' AND a.completed AND a.generation=r.generation
     AND a.claim_fence::text=p->>'admissionFence' AND a.generation::text=p->>'generation');
END $f$;
CREATE FUNCTION tll_provisional_private.bridge_terminal(p jsonb,terminal text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF terminal NOT IN ('held','cancelled') THEN RAISE EXCEPTION 'Invalid bridge terminal'; END IF;
 UPDATE tll_provisional_private.intents SET state=terminal,material=NULL,
   generation=generation+CASE WHEN terminal='cancelled' THEN 1 ELSE 0 END,fence=nextval('tll_provisional_private.fences')
 WHERE id=(p->>'transactionId')::uuid AND browser_hash=p->>'browserHash' AND config_hash=p->>'configHash'
   AND intent_hash=p->>'intentHash' AND application_challenge=p->>'applicationPkceChallenge' AND state NOT IN ('held','cancelled');
END $f$;
CREATE FUNCTION tll_broker_private.bridge_terminal(p jsonb,terminal text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 IF terminal NOT IN ('held','cancelled') THEN RAISE EXCEPTION 'Invalid bridge terminal'; END IF;
 UPDATE tll_broker_private.flows SET status=terminal,generation=generation+CASE WHEN terminal='cancelled' THEN 1 ELSE 0 END,
   fence=nextval('tll_broker_private.fences')
 WHERE id=(p->>'transactionId')::uuid AND browser_hash=p->>'browserHash' AND outer_hash=p->>'outerHash' AND status NOT IN ('held','cancelled');
END $f$;
CREATE FUNCTION tll_broker_private.bridge_register(operation_id uuid,s jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE m jsonb:=s->'metadata'; o jsonb:=s->'outer'; r jsonb; ts timestamptz:=clock_timestamp(); f bigint;
 rid uuid:=(m->>'transactionId')::uuid; created timestamptz:=tll_broker_private.ms(m->'createdAt'); expiry timestamptz:=tll_broker_private.ms(m->'expiresAt');
BEGIN
 IF created>ts OR expiry<=ts OR expiry>created+interval '5 minutes'
   OR EXISTS(SELECT FROM tll_broker_private.flows WHERE id=rid OR outer_hash=s->>'outerHash' OR outer_state=(o->>'state')::uuid)
   OR EXISTS(SELECT FROM tll_broker_private.operations WHERE id=operation_id)
   OR (SELECT count(*) FROM tll_broker_private.flows)>=10000 OR (SELECT count(*) FROM tll_broker_private.operations)>=100000
   OR (SELECT count(*) FROM tll_broker_private.flows WHERE browser_hash=m->>'browserHash' AND created_at>ts-interval '10 minutes')>=10
   OR COALESCE((SELECT registrations FROM tll_broker_private.daily_quota WHERE day=(ts AT TIME ZONE 'UTC')::date),0)>=500 THEN RETURN false; END IF;
 r:=jsonb_build_object('id',rid,'configHash','7c54b659cf0e2ecdf07ce2b34ea10d7fc0a7c6ef3c9f59f38ca8f5cd79e86780',
   'browserHash',m->>'browserHash','outer',o,'outerHash',s->>'outerHash','applicationPkceChallenge',m->>'applicationPkceChallenge',
   'mode',m->>'mode','target',CASE WHEN m->>'mode'='migration' THEN jsonb_build_object('userId',m->'original'->>'userId','sessionId',m->'original'->>'sessionId') ELSE 'null'::jsonb END,
   'createdAt',m->'createdAt','expiresAt',m->'expiresAt');
 f:=nextval('tll_broker_private.fences');
 INSERT INTO tll_broker_private.flows(id,config_hash,browser_hash,outer_hash,outer_state,registration,created_at,expires_at,status,fence)
 VALUES(rid,r->>'configHash',m->>'browserHash',s->>'outerHash',(o->>'state')::uuid,r,created,expiry,'registered',f);
 INSERT INTO tll_broker_private.operations VALUES(operation_id,rid,'register',0,f,true,ts);
 INSERT INTO tll_broker_private.daily_quota VALUES((ts AT TIME ZONE 'UTC')::date,1) ON CONFLICT(day) DO UPDATE SET registrations=tll_broker_private.daily_quota.registrations+1;
 RETURN true;
END $f$;
CREATE FUNCTION tll_bridge_private.terminal(rid uuid,terminal text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE g tll_bridge_private.grants%ROWTYPE;
BEGIN
 PERFORM tll_bridge_private.gate();
 SELECT * INTO g FROM tll_bridge_private.grants WHERE id=rid;
 IF NOT FOUND THEN RETURN; END IF;
 IF terminal NOT IN ('held','cancelled') THEN RAISE EXCEPTION 'Invalid bridge terminal'; END IF;
 PERFORM tll_broker_private.bridge_terminal(g.binding||jsonb_build_object('outerHash',g.outer_hash),terminal);
 PERFORM tll_provisional_private.bridge_terminal(g.binding,terminal);
 UPDATE tll_bridge_private.grants SET state=terminal,release_hash=NULL WHERE id=rid AND state NOT IN ('held','cancelled');
END $f$;
CREATE FUNCTION tll_bridge_private.authorize(rid uuid,op text,p jsonb) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE gate jsonb:=tll_bridge_private.gate(); g tll_bridge_private.grants%ROWTYPE; s jsonb;
BEGIN
 SELECT * INTO g FROM tll_bridge_private.grants WHERE id=rid;
 IF NOT FOUND OR gate->'enabled'<>'true'::jsonb OR g.epoch::text IS DISTINCT FROM gate->>'epoch'
   OR g.expires_at<=clock_timestamp() OR g.state NOT IN ('pending_browser','browser_admitted') THEN RETURN false; END IF;
 s:=tll_provisional_private.bridge_source(g.binding);
 IF s IS NULL OR s->>'state'<>'admitted' OR s->>'epoch' IS DISTINCT FROM g.epoch::text
   OR s->>'generation' IS DISTINCT FROM g.source_generation::text OR s->>'fence' IS DISTINCT FROM g.source_snapshot->>'fence'
   OR s->'admissionCompleted' IS DISTINCT FROM 'true'::jsonb OR s->'metadata' IS DISTINCT FROM g.source_snapshot->'metadata'
   OR s->'outer' IS DISTINCT FROM g.source_snapshot->'outer' OR s->>'outerHash' IS DISTINCT FROM g.outer_hash THEN RETURN false; END IF;
 IF op='admit' THEN RETURN COALESCE(g.state='pending_browser' AND p->>'releaseHash'=g.release_hash,false); END IF;
 RETURN g.state='browser_admitted';
END $f$;
CREATE FUNCTION tll_bridge_private.browser_admitted(rid uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN UPDATE tll_bridge_private.grants SET state='browser_admitted',release_hash=NULL WHERE id=rid AND state='pending_browser'; END $f$;
CREATE FUNCTION tll_bridge_private.advance_epoch() RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN PERFORM tll_bridge_private.gate(); UPDATE tll_bridge_private.control SET epoch=epoch+1 WHERE singleton; END $f$;

-- Same public signatures: installed callers cannot reach the original ungated
-- transitions, including direct register and implicit code-replay quarantine.
CREATE FUNCTION tll_provisional_private.repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE gate jsonb:=tll_bridge_private.gate(); result jsonb; rid uuid; e bigint; state text;
BEGIN
 IF op NOT IN ('hold','cancel','read_intent') THEN
   IF gate->'enabled'<>'true'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF op<>'prepare' THEN
     SELECT bridge_epoch INTO e FROM tll_provisional_private.intents WHERE id=(p->>'transactionId')::uuid;
     IF e::text IS DISTINCT FROM gate->>'epoch' THEN RETURN jsonb_build_object('status','rejected'); END IF;
   END IF;
 END IF;
 result:=tll_provisional_private.repository_v1(op,p);
 rid:=(p->>'transactionId')::uuid;
 IF op='prepare' AND result->>'status'='prepared' THEN UPDATE tll_provisional_private.intents SET bridge_epoch=(gate->>'epoch')::bigint WHERE id=rid; END IF;
 IF op IN ('hold','cancel') AND result->>'status' IN ('held','cancelled') THEN
   state:=result->>'status'; PERFORM tll_bridge_private.terminal(rid,state);
 END IF;
 RETURN result;
END $f$;
CREATE FUNCTION tll_broker_private.repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE gate jsonb:=tll_bridge_private.gate(); rid uuid; result jsonb; state text;
BEGIN
 IF op='register' THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='redeem_code' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE code_hash=p->>'codeHash';
 ELSIF op='consume_userinfo' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE bearer_hash=p->>'bearerHash';
 ELSIF op='hold' THEN
   IF p->'locator'->>'kind'='transaction' THEN rid:=(p->'locator'->>'id')::uuid;
   ELSIF p->'locator'->>'kind'='code' THEN SELECT id INTO rid FROM tll_broker_private.flows WHERE code_hash=p->'locator'->>'hash';
   ELSE SELECT id INTO rid FROM tll_broker_private.flows WHERE bearer_hash=p->'locator'->>'hash'; END IF;
 ELSE rid:=(p->>'transactionId')::uuid; END IF;
 IF op NOT IN ('hold','cancel') AND tll_bridge_private.authorize(rid,op,p) IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','rejected'); END IF;
 result:=tll_broker_private.repository_v1(op,p-'releaseHash');
 IF op='admit' AND result->>'status'='admitted' THEN PERFORM tll_bridge_private.browser_admitted(rid); END IF;
 SELECT status INTO state FROM tll_broker_private.flows WHERE id=rid;
 IF state IN ('held','cancelled') THEN PERFORM tll_bridge_private.terminal(rid,state); END IF;
 RETURN result;
END $f$;
CREATE FUNCTION tll_broker_private.operator_set_enabled(enable_use boolean,change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE result jsonb; BEGIN
 PERFORM tll_bridge_private.gate(); result:=tll_broker_private.operator_set_enabled_v1(enable_use,change_reason_code);
 IF NOT enable_use THEN PERFORM tll_bridge_private.advance_epoch(); END IF; RETURN result;
END $f$;
CREATE FUNCTION tll_provisional_private.operator_set_enabled(enable_use boolean,change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE result jsonb; BEGIN
 PERFORM tll_bridge_private.gate(); result:=tll_provisional_private.operator_set_enabled_v1(enable_use,change_reason_code);
 IF NOT enable_use THEN PERFORM tll_bridge_private.advance_epoch(); END IF; RETURN result;
END $f$;

CREATE FUNCTION tll_bridge_private.repository(op text,p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE gate jsonb; s jsonb; m jsonb; proof jsonb; original jsonb; b jsonb; g tll_bridge_private.grants%ROWTYPE;
 rid uuid; oid uuid; previous tll_bridge_private.operations%ROWTYPE; ts timestamptz; expiry timestamptz;
BEGIN
 IF op IS NULL OR op NOT IN ('register','hold','cancel','inspect') OR jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>16384
   OR NOT tll_provisional_private.uuid_valid(p->>'transactionId') OR NOT tll_provisional_private.hash_valid(p->>'browserHash')
   OR NOT tll_provisional_private.hash_valid(p->>'configHash') OR NOT tll_provisional_private.hash_valid(p->>'intentHash')
   OR NOT tll_provisional_private.opaque_valid(p->>'applicationPkceChallenge') OR NOT tll_provisional_private.uuid_valid(p->>'admissionOperationId')
   OR COALESCE(p->>'admissionFence','') !~ '^[1-9][0-9]{0,18}$' OR COALESCE(p->>'generation','') !~ '^(0|[1-9][0-9]{0,18})$'
   OR NOT tll_provisional_private.hash_valid(p->>'outerHash') OR (op<>'inspect' AND NOT tll_provisional_private.uuid_valid(p->>'operationId'))
   OR p-ARRAY['transactionId','browserHash','configHash','intentHash','applicationPkceChallenge','admissionOperationId','admissionFence','generation','outerHash','operationId','releaseHash','currentMigrationProof']<>'{}'::jsonb THEN
   RAISE EXCEPTION 'Admission bridge request unavailable' USING ERRCODE='22023'; END IF;
 gate:=tll_bridge_private.gate(); ts:=clock_timestamp(); rid:=(p->>'transactionId')::uuid;
 b:=p-ARRAY['outerHash','operationId','releaseHash','currentMigrationProof'];
 s:=tll_provisional_private.bridge_source(b);
 SELECT * INTO g FROM tll_bridge_private.grants WHERE id=rid;
 IF g.id IS NOT NULL AND (g.binding<>b OR g.outer_hash IS DISTINCT FROM p->>'outerHash') THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF s IS NULL OR s->>'outerHash' IS DISTINCT FROM p->>'outerHash' THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op='inspect' THEN
   IF g.id IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   RETURN jsonb_build_object('status','metadata_only','state',g.state,'expiresAt',floor(extract(epoch FROM g.expires_at)*1000)::bigint,
     'epochCurrent',g.epoch::text=gate->>'epoch','observedAt',floor(extract(epoch FROM ts)*1000)::bigint);
 END IF;
 oid:=(p->>'operationId')::uuid;
 IF oid=(p->>'admissionOperationId')::uuid THEN RETURN jsonb_build_object('status','rejected'); END IF;
 SELECT * INTO previous FROM tll_bridge_private.operations WHERE id=oid;
 IF previous.id IS NOT NULL AND (previous.transaction_id<>rid OR (op<>'hold' AND previous.phase<>op)) THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF op IN ('hold','cancel') THEN
   IF g.state IN ('held','cancelled') AND previous.id IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
   -- Source authority is the original acknowledged admission claim, not a bare ID.
   IF s->>'generation' IS DISTINCT FROM p->>'generation' OR s->'admissionCompleted' IS DISTINCT FROM 'true'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF g.id IS NULL THEN
     IF (SELECT count(*) FROM tll_bridge_private.grants)>=20000 OR (SELECT count(*) FROM tll_bridge_private.operations)>=100000 THEN RAISE EXCEPTION 'Admission bridge quarantine capacity unavailable'; END IF;
     INSERT INTO tll_bridge_private.grants(id,binding,source_snapshot,admission_operation,admission_fence,source_generation,registration_operation,outer_hash,epoch,expires_at,state)
     VALUES(rid,b,s,(p->>'admissionOperationId')::uuid,(p->>'admissionFence')::bigint,(p->>'generation')::bigint,oid,p->>'outerHash',(gate->>'epoch')::bigint,
       tll_provisional_private.ms(s->'metadata'->'expiresAt'),CASE WHEN op='cancel' THEN 'cancelled' ELSE 'held' END);
   END IF;
   IF previous.id IS NULL THEN INSERT INTO tll_bridge_private.operations VALUES(oid,rid,op); END IF;
   PERFORM tll_bridge_private.terminal(rid,CASE WHEN op='cancel' THEN 'cancelled' ELSE 'held' END);
   RETURN jsonb_build_object('status',CASE WHEN op='cancel' THEN 'cancelled' ELSE 'held' END);
 END IF;
 IF previous.id IS NOT NULL OR g.id IS NOT NULL OR gate->'enabled'<>'true'::jsonb OR s->>'state'<>'admitted'
   OR s->>'epoch' IS DISTINCT FROM gate->>'epoch' OR s->'admissionCompleted' IS DISTINCT FROM 'true'::jsonb
   OR NOT tll_provisional_private.hash_valid(p->>'releaseHash')
   OR (SELECT count(*) FROM tll_bridge_private.grants)>=10000 OR (SELECT count(*) FROM tll_bridge_private.operations)>=100000 THEN RETURN jsonb_build_object('status','rejected'); END IF;
 m:=s->'metadata'; expiry:=tll_provisional_private.ms(m->'expiresAt'); IF expiry<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
 proof:=p->'currentMigrationProof'; original:=m->'original';
 IF m->>'mode'='migration' THEN
   IF jsonb_typeof(proof) IS DISTINCT FROM 'object' OR proof-ARRAY['userId','sessionId','accessTokenHash','issuer','audience','anonymous','checkedAt','authenticatedAt','expiresAt']<>'{}'::jsonb
     OR proof->>'userId' IS DISTINCT FROM original->>'userId' OR proof->>'sessionId' IS DISTINCT FROM original->>'sessionId'
     OR proof->>'accessTokenHash' IS DISTINCT FROM original->>'accessTokenHash' OR proof->>'issuer' IS DISTINCT FROM 'https://qdmvngjwkcsilzmqksme.supabase.co/auth/v1'
     OR proof->>'audience' IS DISTINCT FROM 'authenticated' OR proof->'anonymous' IS DISTINCT FROM 'false'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
   IF tll_provisional_private.ms(proof->'checkedAt')>ts OR tll_provisional_private.ms(proof->'checkedAt')<=ts-interval '5 seconds'
     OR tll_provisional_private.ms(proof->'authenticatedAt')>ts OR tll_provisional_private.ms(proof->'authenticatedAt')<=ts-interval '5 minutes'
     OR tll_provisional_private.ms(proof->'expiresAt')<=ts THEN RETURN jsonb_build_object('status','rejected'); END IF;
 ELSIF m->>'mode'<>'sign_in' OR original IS DISTINCT FROM 'null'::jsonb OR proof IS DISTINCT FROM 'null'::jsonb THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF NOT tll_broker_private.bridge_register(oid,s) THEN RETURN jsonb_build_object('status','rejected'); END IF;
 INSERT INTO tll_bridge_private.grants(id,binding,source_snapshot,admission_operation,admission_fence,source_generation,registration_operation,outer_hash,epoch,expires_at,state,release_hash)
 VALUES(rid,b,s,(p->>'admissionOperationId')::uuid,(p->>'admissionFence')::bigint,(p->>'generation')::bigint,oid,p->>'outerHash',(gate->>'epoch')::bigint,expiry,'pending_browser',p->>'releaseHash');
 INSERT INTO tll_bridge_private.operations VALUES(oid,rid,'register');
 RETURN jsonb_build_object('status','registered','transactionId',rid,'expiresAt',m->'expiresAt');
END $f$;
CREATE FUNCTION tll_bridge_private.operator_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
DECLARE c tll_bridge_private.control%ROWTYPE; BEGIN
 SELECT * INTO STRICT c FROM tll_bridge_private.control WHERE singleton;
 IF c.operator_oid<>session_user::regrole::oid THEN RAISE EXCEPTION 'Admission bridge operator unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('enabled',c.enabled,'epoch',c.epoch::text,'reasonCode',c.reason_code,
   'grants',(SELECT count(*) FROM tll_bridge_private.grants),'operations',(SELECT count(*) FROM tll_bridge_private.operations));
END $f$;
CREATE FUNCTION tll_bridge_private.operator_set_enabled(enable_use boolean,change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $f$
BEGIN
 PERFORM tll_bridge_private.gate();
 PERFORM tll_bridge_private.operator_status();
 IF enable_use IS NULL OR change_reason_code IS NULL OR change_reason_code !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN RAISE EXCEPTION 'Invalid bridge control request' USING ERRCODE='22023'; END IF;
 UPDATE tll_bridge_private.control SET enabled=enable_use,epoch=epoch+CASE WHEN enable_use THEN 0 ELSE 1 END,
   reason_code=change_reason_code,changed_at=clock_timestamp() WHERE singleton;
 RETURN tll_bridge_private.operator_status();
END $f$;

-- Ownership plus complete removal of creation/default grants on every new or
-- replaced function, including the renamed originals and inherited installer ACLs.
DO $acl$
DECLARE s text; owner_name text; r record; g record;
BEGIN
 FOREACH s IN ARRAY ARRAY['tll_broker_private','tll_provisional_private','tll_bridge_private'] LOOP
   owner_name:=CASE s WHEN 'tll_broker_private' THEN 'tll_broker_owner' WHEN 'tll_provisional_private' THEN 'tll_provisional_owner' ELSE 'tll_bridge_owner' END;
   FOR r IN SELECT oid,oid::regprocedure AS signature FROM pg_proc WHERE pronamespace=s::regnamespace LOOP
     EXECUTE format('ALTER FUNCTION %s OWNER TO %I',r.signature,owner_name);
     FOR g IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=r.oid AND x.grantee<>owner_name::regrole LOOP
       EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
     END LOOP;
   END LOOP;
 END LOOP;
 FOR r IN SELECT oid,relname FROM pg_class WHERE relnamespace='tll_bridge_private'::regnamespace AND relkind='r' LOOP
   EXECUTE format('ALTER TABLE tll_bridge_private.%I OWNER TO tll_bridge_owner',r.relname);
   EXECUTE format('ALTER TABLE tll_bridge_private.%I ENABLE ROW LEVEL SECURITY',r.relname);
   FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) x WHERE c.oid=r.oid AND x.grantee<>'tll_bridge_owner'::regrole LOOP
     EXECUTE format('REVOKE ALL ON TABLE tll_bridge_private.%I FROM %s',r.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
   END LOOP;
 END LOOP;
 FOR g IN SELECT DISTINCT x.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='tll_bridge_private' AND x.grantee<>n.nspowner LOOP
   EXECUTE format('REVOKE ALL ON SCHEMA tll_bridge_private FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
 END LOOP;
END $acl$;
GRANT USAGE ON SCHEMA tll_bridge_private TO tll_bridge_executor,tll_broker_owner,tll_provisional_owner;
GRANT USAGE ON SCHEMA tll_broker_private,tll_provisional_private TO tll_bridge_owner;
GRANT EXECUTE ON FUNCTION tll_bridge_private.repository(text,jsonb) TO tll_bridge_executor;
GRANT EXECUTE ON FUNCTION tll_bridge_private.gate(),tll_bridge_private.terminal(uuid,text),tll_bridge_private.advance_epoch() TO tll_broker_owner,tll_provisional_owner;
GRANT EXECUTE ON FUNCTION tll_bridge_private.authorize(uuid,text,jsonb),tll_bridge_private.browser_admitted(uuid) TO tll_broker_owner;
GRANT EXECUTE ON FUNCTION tll_broker_private.bridge_lock(),tll_broker_private.bridge_register(uuid,jsonb),tll_broker_private.bridge_terminal(jsonb,text),
 tll_provisional_private.bridge_lock(),tll_provisional_private.bridge_source(jsonb),tll_provisional_private.bridge_terminal(jsonb,text),
 tll_provisional_private.uuid_valid(text),tll_provisional_private.hash_valid(text),tll_provisional_private.opaque_valid(text),tll_provisional_private.ms(jsonb) TO tll_bridge_owner;
GRANT EXECUTE ON FUNCTION tll_broker_private.repository(text,jsonb) TO tll_broker_executor;
GRANT EXECUTE ON FUNCTION tll_provisional_private.repository(text,jsonb) TO tll_provisional_executor;
DO $retire$
DECLARE s text; r text; installer name:=current_user;
BEGIN
 FOREACH s IN ARRAY ARRAY['tll_broker_private','tll_provisional_private','tll_bridge_private'] LOOP
   EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I',s,installer);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %I.operator_status(),%I.operator_set_enabled(boolean,text) TO %I',s,s,installer);
 END LOOP;
 FOREACH r IN ARRAY ARRAY['tll_broker_owner','tll_provisional_owner','tll_bridge_owner'] LOOP
   IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
     EXECUTE format('GRANT %I TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',r,installer);
   ELSE EXECUTE format('REVOKE %I FROM %I GRANTED BY %I',r,installer,installer); END IF;
 END LOOP;
END $retire$;
DO $postflight$
DECLARE s text; r record; f record; owner_name text; role_name text; expected boolean;
BEGIN
 IF tll_bridge_private.operator_status()->'enabled'<>'false'::jsonb OR tll_broker_private.operator_status()->'enabled'<>'false'::jsonb
   OR tll_provisional_private.operator_status()->'enabled'<>'false'::jsonb THEN RAISE EXCEPTION 'Unexpected bridge activation'; END IF;
 FOREACH role_name IN ARRAY ARRAY['tll_bridge_owner','tll_bridge_executor'] LOOP
   IF EXISTS(SELECT FROM pg_roles WHERE rolname=role_name AND (rolcanlogin OR rolsuper OR rolcreaterole OR rolcreatedb OR rolbypassrls OR rolreplication OR rolinherit))
     OR (SELECT count(*) FROM pg_auth_members WHERE roleid=role_name::regrole)<>1
     OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid=role_name::regrole AND member=current_user::regrole
       AND admin_option AND NOT inherit_option AND NOT set_option AND (SELECT rolsuper FROM pg_roles WHERE oid=grantor))
     OR EXISTS(SELECT FROM pg_auth_members WHERE member=role_name::regrole) THEN RAISE EXCEPTION 'Unexpected bridge role authority'; END IF;
 END LOOP;
 FOREACH s IN ARRAY ARRAY['tll_broker_private','tll_provisional_private','tll_bridge_private'] LOOP
   owner_name:=CASE s WHEN 'tll_broker_private' THEN 'tll_broker_owner' WHEN 'tll_provisional_private' THEN 'tll_provisional_owner' ELSE 'tll_bridge_owner' END;
   FOR r IN SELECT n.nspowner,x.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.oid=s::regnamespace LOOP
     IF r.nspowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private schema owner'; END IF;
     IF r.grantee=r.nspowner THEN CONTINUE; END IF;
     expected:=r.grantee=current_user::regrole
       OR r.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole
       OR (s='tll_bridge_private' AND r.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole))
       OR (s<>'tll_bridge_private' AND r.grantee='tll_bridge_owner'::regrole);
     IF NOT expected OR r.privilege_type<>'USAGE' OR r.is_grantable THEN RAISE EXCEPTION 'Unexpected private schema ACL'; END IF;
   END LOOP;
   FOR r IN SELECT c.oid,c.relkind,c.relowner,c.relrowsecurity FROM pg_class c WHERE c.relnamespace=s::regnamespace AND c.relkind IN ('r','S') LOOP
     IF r.relowner<>owner_name::regrole OR (r.relkind='r' AND NOT r.relrowsecurity) THEN RAISE EXCEPTION 'Wrong private relation ownership or RLS'; END IF;
     IF EXISTS(SELECT FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x
       WHERE c.oid=r.oid AND x.grantee<>r.relowner)
       OR EXISTS(SELECT FROM pg_attribute a CROSS JOIN LATERAL aclexplode(a.attacl) x WHERE a.attrelid=r.oid AND x.grantee<>r.relowner) THEN
       RAISE EXCEPTION 'Unexpected private relation or column ACL'; END IF;
   END LOOP;
   -- Every nonowner function ACL must match the narrow explicit graph below;
   -- no PUBLIC or nonowner GRANT OPTION survives default or inherited grants.
   FOR f IN SELECT p.oid,p.proname,p.proowner,x.grantee,x.privilege_type,x.is_grantable FROM pg_proc p
     CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.pronamespace=s::regnamespace LOOP
     IF f.proowner<>owner_name::regrole THEN RAISE EXCEPTION 'Wrong private function owner'; END IF;
     IF f.grantee=f.proowner THEN CONTINUE; END IF;
     expected:=(f.grantee=current_user::regrole AND f.proname IN ('operator_status','operator_set_enabled'))
       OR (f.proname='repository' AND f.grantee=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END)::regrole)
       OR (s='tll_bridge_private' AND f.grantee IN ('tll_broker_owner'::regrole,'tll_provisional_owner'::regrole) AND f.proname IN ('gate','terminal','advance_epoch'))
       OR (s='tll_bridge_private' AND f.grantee='tll_broker_owner'::regrole AND f.proname IN ('authorize','browser_admitted'))
       OR (s='tll_broker_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_register','bridge_terminal'))
       OR (s='tll_provisional_private' AND f.grantee='tll_bridge_owner'::regrole AND f.proname IN ('bridge_lock','bridge_source','bridge_terminal','uuid_valid','hash_valid','opaque_valid','ms'));
     IF NOT expected OR f.privilege_type<>'EXECUTE' OR f.is_grantable THEN RAISE EXCEPTION 'Unexpected private function ACL'; END IF;
   END LOOP;
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role','tll_broker_executor','tll_provisional_executor','tll_bridge_executor',current_user::text] LOOP
     IF (SELECT rolsuper FROM pg_roles WHERE rolname=role_name) THEN CONTINUE; END IF;
     IF has_schema_privilege(role_name,s,'CREATE') THEN RAISE EXCEPTION 'Unexpected private schema CREATE'; END IF;
     expected:=role_name=current_user::text OR role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END);
     IF has_schema_privilege(role_name,s,'USAGE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
     FOR r IN SELECT oid,relkind FROM pg_class WHERE relnamespace=s::regnamespace AND relkind IN ('r','S') LOOP
       IF r.relkind='r' AND (has_table_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
         OR has_any_column_privilege(role_name,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private data access'; END IF;
       IF r.relkind='S' AND has_sequence_privilege(role_name,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected effective sequence access'; END IF;
     END LOOP;
     FOR f IN SELECT oid,proname FROM pg_proc WHERE pronamespace=s::regnamespace LOOP
       expected:=(role_name=current_user::text AND f.proname IN ('operator_status','operator_set_enabled'))
         OR (role_name=(CASE s WHEN 'tll_broker_private' THEN 'tll_broker_executor' WHEN 'tll_provisional_private' THEN 'tll_provisional_executor' ELSE 'tll_bridge_executor' END) AND f.proname='repository');
       IF has_function_privilege(role_name,f.oid,'EXECUTE') IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
     END LOOP;
   END LOOP;
 END LOOP;
END $postflight$;
COMMIT;
