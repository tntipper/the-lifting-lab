-- Disabled additive guest-to-account cart custody transition. No provider call,
-- LOGIN, credential, route or activation is created.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
DECLARE installer name:=current_user;
BEGIN
 IF current_user<>session_user OR current_setting('server_version_num')::int<170000
   OR to_regclass('tll_cart_private.sessions') IS NULL OR to_regclass('tll_cart_private.transitions') IS NOT NULL
   OR to_regprocedure('public.tll_cart_transition_claim(text,text,text,text,uuid,bigint)') IS NOT NULL
   OR (SELECT operator_oid FROM tll_cart_private.control WHERE singleton)<>current_user::regrole
   OR (SELECT enabled FROM tll_cart_private.control WHERE singleton) THEN
   RAISE EXCEPTION 'Disabled reviewed cart repository required'; END IF;
 IF (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.tll_cart_open(text,text)'::regprocedure)<>'b40e7148f3fea1e658263fc6292b1ef1'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.tll_cart_read(text,text)'::regprocedure)<>'4ff1b6edceeb59d708c57a52042c7661'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.tll_cart_claim(text,text,uuid,text,bigint,integer)'::regprocedure)<>'3e817c44f5dd9a5c88bd038b2774f567'
   OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.tll_cart_finish(text,text,uuid,text,jsonb,integer,integer,integer)'::regprocedure)<>'660c727005e044e69352676928bbb0ac'
   OR NOT EXISTS(SELECT FROM pg_auth_members WHERE roleid='tll_cart_owner'::regrole AND member=current_user::regrole
     AND admin_option AND NOT inherit_option AND NOT set_option) THEN RAISE EXCEPTION 'Reviewed cart source and upgrade authority required'; END IF;
 EXECUTE format('GRANT tll_cart_owner TO %I WITH INHERIT TRUE, SET TRUE',installer);
 GRANT CREATE ON SCHEMA public TO tll_cart_owner;
END $preflight$;

CREATE TABLE tll_cart_private.transitions(
 source_session text PRIMARY KEY REFERENCES tll_cart_private.sessions(session_hash),
 source_actor text NOT NULL CHECK(source_actor ~ '^[a-f0-9]{64}$'),
 target_session text NOT NULL UNIQUE CHECK(target_session ~ '^[a-f0-9]{64}$'),
 target_actor text NOT NULL CHECK(target_actor ~ '^[a-f0-9]{64}$'),
 request_id uuid NOT NULL UNIQUE, expected_revision bigint NOT NULL CHECK(expected_revision>=0),
 state text NOT NULL CHECK(state IN ('claimed','reconciled','held')),
 lease_until timestamptz, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), finished_at timestamptz,
 CHECK(source_session<>target_session AND source_actor<>target_actor),
 CHECK((state='claimed')=(lease_until IS NOT NULL)),
 CHECK((state='reconciled')=(finished_at IS NOT NULL))
);
REVOKE ALL ON TABLE tll_cart_private.transitions FROM PUBLIC,anon,authenticated,service_role,tll_cart_gateway;
ALTER TABLE tll_cart_private.transitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT,INSERT,UPDATE ON tll_cart_private.transitions TO tll_cart_owner;
CREATE POLICY cart_transitions_owner ON tll_cart_private.transitions TO tll_cart_owner USING(true) WITH CHECK(true);

CREATE FUNCTION public.tll_cart_transition_read(p_source text,p_source_actor text,p_target text,p_target_actor text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE t tll_cart_private.transitions%ROWTYPE; s tll_cart_private.sessions%ROWTYPE; target tll_cart_private.sessions%ROWTYPE;
BEGIN
 IF p_source IS NULL OR p_source!~'^[a-f0-9]{64}$' OR p_source_actor IS NULL OR p_source_actor!~'^[a-f0-9]{64}$'
   OR p_target IS NULL OR p_target!~'^[a-f0-9]{64}$' OR p_target_actor IS NULL OR p_target_actor!~'^[a-f0-9]{64}$'
   OR p_source=p_target OR p_source_actor=p_target_actor THEN RAISE EXCEPTION 'Invalid cart transition context'; END IF;
 PERFORM 1 FROM tll_cart_private.sessions WHERE session_hash IN(p_source,p_target) ORDER BY session_hash FOR UPDATE;
 IF NOT coalesce((SELECT enabled FROM tll_cart_private.control WHERE singleton FOR SHARE),false) THEN RAISE EXCEPTION 'Staging cart repository unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM tll_cart_private.transitions WHERE source_session=p_source;
 SELECT * INTO s FROM tll_cart_private.sessions WHERE session_hash=p_source AND actor_hash=p_source_actor;
 SELECT * INTO target FROM tll_cart_private.sessions WHERE session_hash=p_target AND actor_hash=p_target_actor;
 IF t.source_session IS NULL THEN RETURN jsonb_build_object('status','absent','source',CASE WHEN s.session_hash IS NULL THEN NULL ELSE tll_cart_private.snapshot(s) END,
   'target',CASE WHEN target.session_hash IS NULL THEN NULL ELSE tll_cart_private.snapshot(target) END); END IF;
 IF t.source_actor<>p_source_actor OR t.target_session<>p_target OR t.target_actor<>p_target_actor THEN RETURN jsonb_build_object('status','conflict'); END IF;
 IF t.state='claimed' AND t.lease_until<=clock_timestamp() THEN
   UPDATE tll_cart_private.transitions SET state='held',lease_until=NULL WHERE source_session=p_source RETURNING * INTO t;
   UPDATE tll_cart_private.sessions SET phase='held',lease_until=NULL WHERE session_hash=p_source AND operation_id=t.request_id RETURNING * INTO s;
 END IF;
 RETURN jsonb_build_object('status',t.state,'source',CASE WHEN s.session_hash IS NULL THEN NULL ELSE tll_cart_private.snapshot(s) END,
   'target',CASE WHEN target.session_hash IS NULL THEN NULL ELSE tll_cart_private.snapshot(target) END);
END $f$;

CREATE FUNCTION public.tll_cart_transition_claim(p_source text,p_source_actor text,p_target text,p_target_actor text,p_request uuid,p_revision bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE t tll_cart_private.transitions%ROWTYPE; s tll_cart_private.sessions%ROWTYPE; target tll_cart_private.sessions%ROWTYPE;
BEGIN
 IF p_request IS NULL OR p_revision IS NULL OR p_revision<0 OR p_source IS NULL OR p_source!~'^[a-f0-9]{64}$'
   OR p_source_actor IS NULL OR p_source_actor!~'^[a-f0-9]{64}$' OR p_target IS NULL OR p_target!~'^[a-f0-9]{64}$'
   OR p_target_actor IS NULL OR p_target_actor!~'^[a-f0-9]{64}$' OR p_source=p_target OR p_source_actor=p_target_actor THEN RAISE EXCEPTION 'Invalid cart transition'; END IF;
 PERFORM 1 FROM tll_cart_private.sessions WHERE session_hash IN(p_source,p_target) ORDER BY session_hash FOR UPDATE;
 IF NOT coalesce((SELECT enabled FROM tll_cart_private.control WHERE singleton FOR SHARE),false) THEN RAISE EXCEPTION 'Staging cart repository unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM tll_cart_private.transitions WHERE source_session=p_source;
 IF t.source_session IS NOT NULL THEN
   IF t.source_actor=p_source_actor AND t.target_session=p_target AND t.target_actor=p_target_actor AND t.request_id=p_request AND t.expected_revision=p_revision THEN
     SELECT * INTO s FROM tll_cart_private.sessions WHERE session_hash=p_source;
     SELECT * INTO target FROM tll_cart_private.sessions WHERE session_hash=p_target;
     RETURN jsonb_build_object('status',CASE WHEN t.state='claimed' THEN 'replay' ELSE t.state END,
       'source',tll_cart_private.snapshot(s),'target',CASE WHEN target.session_hash IS NULL THEN NULL ELSE tll_cart_private.snapshot(target) END);
   END IF;
   RETURN jsonb_build_object('status','conflict');
 END IF;
 SELECT * INTO s FROM tll_cart_private.sessions WHERE session_hash=p_source AND actor_hash=p_source_actor;
 SELECT * INTO target FROM tll_cart_private.sessions WHERE session_hash=p_target;
 IF s.session_hash IS NULL OR s.expires_at<=clock_timestamp() OR s.phase<>'ready' OR s.revision<>p_revision OR target.session_hash IS NOT NULL THEN RETURN jsonb_build_object('status','conflict'); END IF;
 INSERT INTO tll_cart_private.transitions(source_session,source_actor,target_session,target_actor,request_id,expected_revision,state,lease_until)
 VALUES(p_source,p_source_actor,p_target,p_target_actor,p_request,p_revision,'claimed',clock_timestamp()+interval '45 seconds');
 UPDATE tll_cart_private.sessions SET phase='working',operation_id=p_request,lease_until=clock_timestamp()+interval '45 seconds' WHERE session_hash=p_source RETURNING * INTO s;
 RETURN jsonb_build_object('status','claimed','source',tll_cart_private.snapshot(s),'target',NULL);
END $f$;

CREATE FUNCTION public.tll_cart_transition_finish(p_source text,p_source_actor text,p_target text,p_target_actor text,p_request uuid,p_envelope jsonb,p_quantity integer,p_unit integer,p_subtotal integer) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $f$
DECLARE t tll_cart_private.transitions%ROWTYPE; s tll_cart_private.sessions%ROWTYPE; target tll_cart_private.sessions%ROWTYPE;
BEGIN
 PERFORM 1 FROM tll_cart_private.sessions WHERE session_hash IN(p_source,p_target) ORDER BY session_hash FOR UPDATE;
 IF NOT coalesce((SELECT enabled FROM tll_cart_private.control WHERE singleton FOR SHARE),false) THEN RAISE EXCEPTION 'Staging cart repository unavailable' USING ERRCODE='55000'; END IF;
 SELECT * INTO t FROM tll_cart_private.transitions WHERE source_session=p_source FOR UPDATE;
 SELECT * INTO s FROM tll_cart_private.sessions WHERE session_hash=p_source AND actor_hash=p_source_actor FOR UPDATE;
 SELECT * INTO target FROM tll_cart_private.sessions WHERE session_hash=p_target;
 IF t.source_session IS NULL OR t.source_actor<>p_source_actor OR t.target_session<>p_target OR t.target_actor<>p_target_actor OR t.request_id<>p_request
   OR t.state<>'claimed' OR s.session_hash IS NULL OR s.phase<>'working' OR s.operation_id<>p_request OR target.session_hash IS NOT NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
 IF t.lease_until<=clock_timestamp() THEN
   UPDATE tll_cart_private.transitions SET state='held',lease_until=NULL WHERE source_session=p_source;
   UPDATE tll_cart_private.sessions SET phase='held',lease_until=NULL WHERE session_hash=p_source;
   RETURN jsonb_build_object('status','held');
 END IF;
 IF p_quantity IS DISTINCT FROM s.quantity OR p_unit IS DISTINCT FROM s.unit_price_pence OR p_subtotal IS DISTINCT FROM s.subtotal_pence
   OR (s.envelope IS NULL)<>(p_envelope IS NULL) OR (p_envelope IS NOT NULL AND tll_cart_private.valid_envelope(p_envelope) IS NOT TRUE) THEN RAISE EXCEPTION 'Invalid cart transition projection'; END IF;
 INSERT INTO tll_cart_private.sessions(session_hash,actor_hash,revision,phase,envelope,quantity,unit_price_pence,subtotal_pence,expires_at)
 VALUES(p_target,p_target_actor,s.revision,'ready',p_envelope,s.quantity,s.unit_price_pence,s.subtotal_pence,clock_timestamp()+interval '24 hours') RETURNING * INTO target;
 UPDATE tll_cart_private.sessions SET revision=revision+1,phase='held',envelope=NULL,quantity=0,unit_price_pence=NULL,subtotal_pence=0,lease_until=NULL WHERE session_hash=p_source;
 UPDATE tll_cart_private.transitions SET state='reconciled',lease_until=NULL,finished_at=clock_timestamp() WHERE source_session=p_source;
 RETURN jsonb_build_object('status','reconciled','target',tll_cart_private.snapshot(target));
END $f$;

DO $secure$
DECLARE installer name:=current_user; signature regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.tll_cart_transition_read(text,text,text,text)'::regprocedure,
   'public.tll_cart_transition_claim(text,text,text,text,uuid,bigint)'::regprocedure,
   'public.tll_cart_transition_finish(text,text,text,text,uuid,jsonb,integer,integer,integer)'::regprocedure] LOOP
   EXECUTE format('ALTER FUNCTION %s OWNER TO tll_cart_owner',signature);
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role,tll_cart_gateway',signature);
   EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO tll_cart_gateway',signature);
 END LOOP;
 REVOKE CREATE ON SCHEMA public FROM tll_cart_owner;
 IF (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
   EXECUTE format('GRANT tll_cart_owner TO %I WITH ADMIN TRUE, INHERIT FALSE, SET FALSE',installer);
 ELSE EXECUTE format('REVOKE tll_cart_owner FROM %I GRANTED BY %I',installer,installer); END IF;
END $secure$;
DO $postflight$
DECLARE r text; signature regprocedure;
BEGIN
 IF (SELECT enabled FROM tll_cart_private.control WHERE singleton) OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='tll_cart_private.transitions'::regclass) THEN RAISE EXCEPTION 'Unexpected cart transition activation'; END IF;
 FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(r,'tll_cart_private.transitions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN') THEN RAISE EXCEPTION 'Transition data authority leak'; END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.tll_cart_transition_read(text,text,text,text)'::regprocedure,
   'public.tll_cart_transition_claim(text,text,text,text,uuid,bigint)'::regprocedure,
   'public.tll_cart_transition_finish(text,text,text,text,uuid,jsonb,integer,integer,integer)'::regprocedure] LOOP
   IF NOT has_function_privilege('tll_cart_gateway',signature,'EXECUTE') OR has_function_privilege('authenticated',signature,'EXECUTE') THEN RAISE EXCEPTION 'Transition function authority mismatch'; END IF;
 END LOOP;
END $postflight$;
COMMIT;
