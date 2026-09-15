-- Unmounted customer-account repository. No credential, executor LOGIN, route or
-- provider activation is created. Install once through migration history.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $preflight$
DECLARE migration_role name:=current_user;
BEGIN
  IF current_setting('server_version_num')::int < 170000 OR to_regclass('auth.users') IS NULL THEN
    RAISE EXCEPTION 'Customer repository requires PostgreSQL17+ and auth.users';
  END IF;
  IF EXISTS (SELECT FROM pg_namespace WHERE nspname='tll_customer_private')
     OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('tll_customer_owner','tll_customer_executor','tll_customer_role_setup')) THEN
    RAISE EXCEPTION 'Customer repository objects already exist; use migration history';
  END IF;
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role'))<>3 THEN
    RAISE EXCEPTION 'Expected Supabase client roles are missing'; END IF;
  IF NOT EXISTS (SELECT FROM pg_attribute WHERE attrelid='auth.users'::regclass AND attname='id' AND atttypid='uuid'::regtype AND NOT attisdropped) THEN
    RAISE EXCEPTION 'Unexpected auth.users primary identity';
  END IF;
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    CREATE ROLE tll_customer_role_setup NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB CREATEROLE NOREPLICATION NOBYPASSRLS;
    EXECUTE format('GRANT tll_customer_role_setup TO %I WITH INHERIT FALSE, SET TRUE',migration_role);
    SET LOCAL ROLE tll_customer_role_setup;
  END IF;
  CREATE ROLE tll_customer_owner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  CREATE ROLE tll_customer_executor NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  EXECUTE format('GRANT tll_customer_owner TO %I WITH INHERIT TRUE, SET TRUE',migration_role);
  EXECUTE format('SET LOCAL ROLE %I',migration_role);
END
$preflight$;
CREATE SCHEMA tll_customer_private AUTHORIZATION tll_customer_owner;
CREATE SEQUENCE tll_customer_private.fences AS bigint NO CYCLE;
CREATE TABLE tll_customer_private.control (
  singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), enabled boolean NOT NULL DEFAULT false,
  -- Exact installing role; operator functions additionally require this SESSION user.
  operator_oid oid NOT NULL, changed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reason_code text NOT NULL DEFAULT 'installed_disabled' CHECK(reason_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$')
);
INSERT INTO tll_customer_private.control(singleton,enabled,operator_oid) VALUES(true,false,current_user::regrole::oid);
CREATE TABLE tll_customer_private.owners (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shop_id text NOT NULL CHECK(shop_id='107532616020'),
  generation bigint NOT NULL DEFAULT 0 CHECK(generation>=0),
  logged_out boolean NOT NULL DEFAULT false,
  PRIMARY KEY(user_id,shop_id)
);
CREATE TABLE tll_customer_private.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, shop_id text NOT NULL,
  issuer text NOT NULL CHECK(issuer='https://shopify.com/authentication/107532616020'),
  subject text NOT NULL CHECK(length(subject) BETWEEN 1 AND 256 AND subject !~ '[[:space:][:cntrl:]]'),
  config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
  generation bigint NOT NULL CHECK(generation>=0), fence bigint NOT NULL CHECK(fence>0),
  status text NOT NULL CHECK(status IN ('active','refreshing','held','logged_out')),
  tokens jsonb, logout_material jsonb, token_context jsonb, logout_context jsonb, access_expires_at timestamptz,
  lease_expires_at timestamptz, claimant_session_id uuid,
  FOREIGN KEY(user_id,shop_id) REFERENCES tll_customer_private.owners ON DELETE CASCADE,
  UNIQUE(shop_id,user_id), UNIQUE(shop_id,issuer,subject),
  CHECK((status IN ('active','refreshing'))=(tokens IS NOT NULL)),
  CHECK((tokens IS NULL)=(token_context IS NULL)),
  CHECK((logout_material IS NULL)=(logout_context IS NULL)),
  CHECK((status='refreshing')=(lease_expires_at IS NOT NULL)),
  CHECK((status='refreshing')=(claimant_session_id IS NOT NULL))
);
CREATE TABLE tll_customer_private.attempts (
  id uuid PRIMARY KEY, state_hash text UNIQUE NOT NULL CHECK(state_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL, shop_id text NOT NULL, session_id uuid NOT NULL,
  config_hash text NOT NULL CHECK(config_hash ~ '^[a-f0-9]{64}$'),
  callback_url text NOT NULL CHECK(length(callback_url) BETWEEN 1 AND 2048),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  status text NOT NULL CHECK(status IN ('pending','exchanging','connected','held')),
  generation bigint NOT NULL CHECK(generation>=0), fence bigint NOT NULL CHECK(fence>0),
  material jsonb, connection_id uuid REFERENCES tll_customer_private.connections ON DELETE SET NULL,
  connection_fence bigint,
  FOREIGN KEY(user_id,shop_id) REFERENCES tll_customer_private.owners ON DELETE CASCADE,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
  CHECK((status IN ('pending','exchanging'))=(material IS NOT NULL))
);
CREATE UNIQUE INDEX one_unfinished_customer_attempt ON tll_customer_private.attempts(user_id,shop_id)
  WHERE status IN ('pending','exchanging');

CREATE FUNCTION tll_customer_private.envelope_valid(e jsonb) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $f$
 SELECT COALESCE(jsonb_typeof(e)='object'
   AND e ?& ARRAY['v','alg','kid','iv','tag','ciphertext']
   AND e - ARRAY['v','alg','kid','iv','tag','ciphertext']='{}'::jsonb
   AND e->'v'='1'::jsonb AND e->>'alg'='A256GCM'
   AND e->>'kid' ~ '^[A-Za-z0-9_-]{1,64}$'
   AND e->>'iv' ~ '^[A-Za-z0-9_-]{16}$' AND e->>'tag' ~ '^[A-Za-z0-9_-]{22}$'
   AND length(e->>'ciphertext') BETWEEN 2 AND 200000 AND e->>'ciphertext' ~ '^[A-Za-z0-9_-]+$',false)
$f$;
ALTER TABLE tll_customer_private.attempts ADD CHECK(material IS NULL OR tll_customer_private.envelope_valid(material));
ALTER TABLE tll_customer_private.connections ADD CHECK(tokens IS NULL OR tll_customer_private.envelope_valid(tokens));
ALTER TABLE tll_customer_private.connections ADD CHECK(logout_material IS NULL OR tll_customer_private.envelope_valid(logout_material));

-- The executor is trusted server infrastructure with prior verified session proof.
-- UUID arguments are NOT browser authentication. There are no browser grants and
-- no auth/session lookup or email-based ownership inference in this repository.
CREATE FUNCTION tll_customer_private.repository(op text, p jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_customer_private AS $fn$
DECLARE
  a tll_customer_private.attempts%ROWTYPE;
  c tll_customer_private.connections%ROWTYPE;
  o tll_customer_private.owners%ROWTYPE;
  uid uuid; shop text; ts timestamptz; f bigint; cid uuid; expiry timestamptz;
  ctx jsonb; answer jsonb; made boolean; use_enabled boolean;
BEGIN
  IF p IS NULL OR jsonb_typeof(p)<>'object' OR op NOT IN
    ('create_attempt','claim_attempt','attempt_context','finish_attempt','hold_attempt',
     'claim_refresh','refresh_context','finish_refresh','hold_refresh','logout') THEN
    RAISE EXCEPTION 'Invalid repository request' USING ERRCODE='22023';
  END IF;
  -- Disabling blocks use/new material; revocation and uncertainty holds still work.
  IF op NOT IN ('hold_attempt','hold_refresh','logout') THEN
    -- A completed operator disable also waits for already-admitted SQL work.
    -- It cannot cancel an external request already sent after an earlier claim.
    SELECT enabled INTO use_enabled FROM tll_customer_private.control WHERE singleton FOR SHARE;
    IF use_enabled IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','rejected'); END IF;
  END IF;
  IF op='create_attempt' THEN uid:=(p->>'userId')::uuid; shop:=p->>'shopId';
  ELSIF op='logout' THEN uid:=(p->>'userId')::uuid; shop:=p->>'shopId';
  ELSIF op='claim_attempt' THEN
    SELECT * INTO a FROM tll_customer_private.attempts WHERE state_hash=p->>'stateHash';
    uid:=a.user_id; shop:=a.shop_id;
  ELSIF op IN ('attempt_context','finish_attempt','hold_attempt') THEN
    SELECT * INTO a FROM tll_customer_private.attempts WHERE id=(p->>'id')::uuid;
    uid:=a.user_id; shop:=a.shop_id;
  ELSE
    SELECT * INTO c FROM tll_customer_private.connections WHERE id=(p->>'id')::uuid;
    uid:=c.user_id; shop:=c.shop_id;
  END IF;
  IF uid IS NULL OR shop IS DISTINCT FROM '107532616020' THEN RETURN jsonb_build_object('status','rejected'); END IF;
  -- Every transition for one user/shop takes this same lock FIRST, including
  -- logout and new attempts. Cross-owner subject races use the unique index.
  IF op IN ('create_attempt','logout') THEN
    INSERT INTO tll_customer_private.owners(user_id,shop_id) VALUES(uid,shop) ON CONFLICT DO NOTHING;
  END IF;
  SELECT * INTO o FROM tll_customer_private.owners WHERE user_id=uid AND shop_id=shop FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','rejected'); END IF;
  ts:=clock_timestamp(); -- sampled AFTER waiting, never the caller clock/transaction start
  IF a.id IS NOT NULL THEN SELECT * INTO a FROM tll_customer_private.attempts WHERE id=a.id; END IF;
  IF c.id IS NOT NULL THEN SELECT * INTO c FROM tll_customer_private.connections WHERE id=c.id; END IF;

  IF op='create_attempt' THEN
    IF p->>'stateHash' !~ '^[a-f0-9]{64}$' OR p->>'configHash' !~ '^[a-f0-9]{64}$'
      OR p->>'callbackUrl' !~ '^https://[a-z0-9-]+\.vercel\.app/auth/shopify/callback$'
      OR NOT tll_customer_private.envelope_valid(p->'material') THEN RETURN jsonb_build_object('status','rejected'); END IF;
    expiry:=to_timestamp((p->>'expiresAt')::numeric/1000);
    IF abs(extract(epoch FROM ts)*1000-(p->>'createdAt')::numeric)>5000
      OR expiry<=ts OR expiry>to_timestamp((p->>'createdAt')::numeric/1000)+interval '5 minutes' THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    UPDATE tll_customer_private.attempts SET status='held',material=NULL
      WHERE user_id=uid AND shop_id=shop AND status IN ('pending','exchanging') AND expires_at<=ts;
    UPDATE tll_customer_private.connections SET status='held',tokens=NULL,token_context=NULL,lease_expires_at=NULL,claimant_session_id=NULL
      WHERE user_id=uid AND shop_id=shop AND status='refreshing' AND lease_expires_at<=ts;
    IF EXISTS(SELECT FROM tll_customer_private.attempts WHERE user_id=uid AND shop_id=shop AND status IN ('pending','exchanging'))
      OR EXISTS(SELECT FROM tll_customer_private.connections WHERE user_id=uid AND shop_id=shop AND status='refreshing') THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    INSERT INTO tll_customer_private.attempts(id,state_hash,user_id,shop_id,session_id,config_hash,callback_url,created_at,expires_at,status,generation,fence,material)
      VALUES((p->>'id')::uuid,p->>'stateHash',uid,shop,(p->>'sessionId')::uuid,p->>'configHash',p->>'callbackUrl',
       to_timestamp((p->>'createdAt')::numeric/1000),expiry,'pending',o.generation,nextval('tll_customer_private.fences'),p->'material')
      ON CONFLICT DO NOTHING RETURNING true INTO made;
    IF made IS DISTINCT FROM true THEN RETURN jsonb_build_object('status','rejected'); END IF;
    UPDATE tll_customer_private.owners SET logged_out=false WHERE user_id=uid AND shop_id=shop;
    RETURN jsonb_build_object('status','created');
  ELSIF op='logout' THEN
    -- Current verified sessions can revoke all connection use for their user/shop.
    -- Session id is required for caller discipline; external adapter verifies it.
    IF (p->>'sessionId')::uuid IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
    IF NOT o.logged_out THEN UPDATE tll_customer_private.owners SET generation=generation+1,logged_out=true WHERE user_id=uid AND shop_id=shop; END IF;
    UPDATE tll_customer_private.attempts SET status='held',material=NULL,fence=nextval('tll_customer_private.fences')
      WHERE user_id=uid AND shop_id=shop AND status<>'held';
    SELECT * INTO c FROM tll_customer_private.connections WHERE user_id=uid AND shop_id=shop;
    IF FOUND AND c.status<>'logged_out' THEN
      UPDATE tll_customer_private.connections SET status='logged_out',tokens=NULL,token_context=NULL,
        lease_expires_at=NULL,claimant_session_id=NULL,fence=nextval('tll_customer_private.fences') WHERE id=c.id;
    END IF;
    RETURN jsonb_build_object('status','local_revoked','upstreamLogout',CASE WHEN c.id IS NULL THEN 'not_required' ELSE 'pending' END);
  ELSIF op IN ('hold_attempt','hold_refresh') THEN
    IF op='hold_attempt' AND a.fence=(p->>'fence')::bigint THEN
      UPDATE tll_customer_private.attempts SET status='held',material=NULL WHERE id=a.id;
      UPDATE tll_customer_private.connections SET status='held',tokens=NULL,token_context=NULL,lease_expires_at=NULL,claimant_session_id=NULL
        WHERE id=a.connection_id AND fence=a.connection_fence AND status<>'logged_out';
    ELSIF op='hold_refresh' AND c.fence=(p->>'fence')::bigint AND c.status<>'logged_out' THEN
      UPDATE tll_customer_private.connections SET status='held',tokens=NULL,token_context=NULL,lease_expires_at=NULL,claimant_session_id=NULL WHERE id=c.id;
    END IF;
    RETURN jsonb_build_object('status','held');
  ELSIF op='claim_attempt' THEN
    IF a.status<>'pending' OR a.user_id IS DISTINCT FROM (p->>'userId')::uuid OR a.session_id IS DISTINCT FROM (p->>'sessionId')::uuid
      OR a.config_hash IS DISTINCT FROM p->>'configHash' OR a.expires_at<=ts OR a.generation<>o.generation OR o.logged_out THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    f:=nextval('tll_customer_private.fences');
    UPDATE tll_customer_private.attempts SET status='exchanging',fence=f WHERE id=a.id;
    RETURN jsonb_build_object('status','claimed','fence',f::text,'id',a.id,'userId',uid,'sessionId',a.session_id,'shopId',shop,
      'stateHash',a.state_hash,'configHash',a.config_hash,'callbackUrl',a.callback_url,
      'createdAt',floor(extract(epoch FROM a.created_at)*1000)::bigint,'expiresAt',floor(extract(epoch FROM a.expires_at)*1000)::bigint,'material',a.material);
  ELSIF op IN ('attempt_context','finish_attempt') THEN
    IF a.status<>'exchanging' OR a.fence IS DISTINCT FROM (p->>'fence')::bigint OR a.expires_at<=ts OR a.generation<>o.generation OR o.logged_out THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    IF op='attempt_context' THEN RETURN jsonb_build_object('status','ready','userId',uid,'shopId',shop,'configHash',a.config_hash); END IF;
    IF uid IS DISTINCT FROM (p->'binding'->>'userId')::uuid OR shop IS DISTINCT FROM p->'binding'->>'shopId'
      OR p->'binding'->>'issuer' IS DISTINCT FROM 'https://shopify.com/authentication/107532616020'
      OR NOT tll_customer_private.envelope_valid(p->'tokens') OR NOT tll_customer_private.envelope_valid(p->'logout') THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    expiry:=to_timestamp((p->>'accessExpiresAt')::numeric/1000);
    IF expiry<=ts OR expiry>ts+interval '24 hours 5 seconds' THEN RETURN jsonb_build_object('status','rejected'); END IF;
    SELECT * INTO c FROM tll_customer_private.connections WHERE user_id=uid AND shop_id=shop;
    IF c.id IS NOT NULL AND (c.subject IS DISTINCT FROM p->'binding'->>'subject' OR c.issuer IS DISTINCT FROM p->'binding'->>'issuer' OR c.status='refreshing') THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    f:=nextval('tll_customer_private.fences');
    ctx:=jsonb_build_object('kind','attempt','id',a.id,'fence',a.fence::text);
    IF c.id IS NULL THEN
      INSERT INTO tll_customer_private.connections(user_id,shop_id,issuer,subject,config_hash,generation,fence,status,tokens,logout_material,token_context,logout_context,access_expires_at)
        VALUES(uid,shop,p->'binding'->>'issuer',p->'binding'->>'subject',a.config_hash,o.generation,f,'active',p->'tokens',p->'logout',ctx,ctx,expiry)
        ON CONFLICT DO NOTHING RETURNING id INTO cid;
      IF cid IS NULL THEN RETURN jsonb_build_object('status','rejected'); END IF;
    ELSE
      cid:=c.id;
      UPDATE tll_customer_private.connections SET status='active',generation=o.generation,config_hash=a.config_hash,fence=f,
        tokens=p->'tokens',logout_material=p->'logout',token_context=ctx,logout_context=ctx,access_expires_at=expiry,lease_expires_at=NULL,claimant_session_id=NULL WHERE id=cid;
    END IF;
    UPDATE tll_customer_private.attempts SET status='connected',material=NULL,connection_id=cid,connection_fence=f WHERE id=a.id;
    RETURN jsonb_build_object('status','connected','connectionId',cid);
  ELSIF op='claim_refresh' THEN
    IF uid IS DISTINCT FROM (p->>'userId')::uuid OR (p->>'sessionId')::uuid IS NULL OR c.config_hash IS DISTINCT FROM p->>'configHash'
      OR o.logged_out OR c.generation<>o.generation THEN RETURN jsonb_build_object('status','rejected'); END IF;
    IF c.status='refreshing' AND c.lease_expires_at<=ts THEN
      UPDATE tll_customer_private.connections SET status='held',tokens=NULL,token_context=NULL,lease_expires_at=NULL,claimant_session_id=NULL WHERE id=c.id;
      RETURN jsonb_build_object('status','rejected');
    END IF;
    IF c.status<>'active' OR (p->>'leaseMs')::int NOT BETWEEN 1 AND 60000 OR EXISTS
      (SELECT FROM tll_customer_private.attempts WHERE user_id=uid AND shop_id=shop AND status IN ('pending','exchanging') AND expires_at>ts) THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    f:=nextval('tll_customer_private.fences'); expiry:=ts+((p->>'leaseMs')::int)*interval '1 millisecond';
    UPDATE tll_customer_private.connections SET status='refreshing',fence=f,lease_expires_at=expiry,claimant_session_id=(p->>'sessionId')::uuid WHERE id=c.id;
    RETURN jsonb_build_object('status','claimed','connectionId',c.id,'fence',f::text,'configHash',c.config_hash,
      'binding',jsonb_build_object('shopId',shop,'issuer',c.issuer,'subject',c.subject,'userId',uid),
      'tokens',c.tokens,'tokenContext',c.token_context,'leaseExpiresAt',floor(extract(epoch FROM expiry)*1000)::bigint);
  ELSIF op IN ('refresh_context','finish_refresh') THEN
    IF c.status<>'refreshing' OR c.fence IS DISTINCT FROM (p->>'fence')::bigint OR c.lease_expires_at<=ts OR c.generation<>o.generation OR o.logged_out THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    IF op='refresh_context' THEN RETURN jsonb_build_object('status','ready','configHash',c.config_hash,
      'binding',jsonb_build_object('shopId',shop,'issuer',c.issuer,'subject',c.subject,'userId',uid)); END IF;
    IF NOT tll_customer_private.envelope_valid(p->'tokens') OR NOT tll_customer_private.envelope_valid(p->'logout') THEN
      RETURN jsonb_build_object('status','rejected'); END IF;
    expiry:=to_timestamp((p->>'accessExpiresAt')::numeric/1000);
    IF expiry<=ts OR expiry>ts+interval '24 hours 5 seconds' THEN RETURN jsonb_build_object('status','rejected'); END IF;
    ctx:=jsonb_build_object('kind','refresh','id',c.id,'fence',c.fence::text);
    UPDATE tll_customer_private.connections SET status='active',tokens=p->'tokens',logout_material=p->'logout',token_context=ctx,logout_context=ctx,
      access_expires_at=expiry,lease_expires_at=NULL,claimant_session_id=NULL WHERE id=c.id;
    RETURN jsonb_build_object('status','refreshed');
  END IF;
  RETURN jsonb_build_object('status','rejected');
END
$fn$;

-- Narrow operator surface: counts/control only, never identity or envelope rows.
-- SET ROLE alone is insufficient: only the recorded installing SESSION user may
-- operate this surface. Re-provisioning an operator requires a reviewed migration.
CREATE FUNCTION tll_customer_private.operator_status() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_customer_private AS $operator$
DECLARE ctl tll_customer_private.control%ROWTYPE;
BEGIN
  SELECT * INTO ctl FROM tll_customer_private.control WHERE singleton;
  IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN
    RAISE EXCEPTION 'Customer repository operator unavailable' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('enabled',ctl.enabled,'changedAt',ctl.changed_at,'reasonCode',ctl.reason_code,
    'owners',(SELECT count(*) FROM tll_customer_private.owners),
    'attempts',(SELECT jsonb_build_object('pending',count(*) FILTER(WHERE status='pending'),
      'exchanging',count(*) FILTER(WHERE status='exchanging'),'connected',count(*) FILTER(WHERE status='connected'),
      'held',count(*) FILTER(WHERE status='held')) FROM tll_customer_private.attempts),
    'connections',(SELECT jsonb_build_object('active',count(*) FILTER(WHERE status='active'),
      'refreshing',count(*) FILTER(WHERE status='refreshing'),'held',count(*) FILTER(WHERE status='held'),
      'loggedOut',count(*) FILTER(WHERE status='logged_out')) FROM tll_customer_private.connections));
END
$operator$;
CREATE FUNCTION tll_customer_private.operator_set_enabled(enable_use boolean, change_reason_code text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,tll_customer_private AS $operator$
DECLARE ctl tll_customer_private.control%ROWTYPE;
BEGIN
  SELECT * INTO ctl FROM tll_customer_private.control WHERE singleton FOR UPDATE;
  IF ctl.operator_oid IS DISTINCT FROM session_user::regrole::oid THEN
    RAISE EXCEPTION 'Customer repository operator unavailable' USING ERRCODE='42501';
  END IF;
  IF enable_use IS NULL OR change_reason_code IS NULL OR change_reason_code !~ '^[a-z0-9][a-z0-9_-]{0,63}$' THEN
    RAISE EXCEPTION 'Invalid customer repository control request' USING ERRCODE='22023';
  END IF;
  UPDATE tll_customer_private.control SET enabled=enable_use,changed_at=clock_timestamp(),reason_code=change_reason_code WHERE singleton;
  RETURN tll_customer_private.operator_status();
END
$operator$;

-- Own all scoped objects, erase EVERY creation ACL (including default grants to
-- indirect browser roles), then grant only the scoped server/operator operations. No shared
-- role/default privileges are changed. No automatic executor login is provisioned.
DO $acl$
DECLARE r record; g record;
BEGIN
  FOR r IN SELECT c.oid,c.relkind,c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_customer_private' AND c.relkind IN ('r','S') LOOP
    EXECUTE format('ALTER %s tll_customer_private.%I OWNER TO tll_customer_owner',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname);
    IF r.relkind='r' THEN EXECUTE format('ALTER TABLE tll_customer_private.%I ENABLE ROW LEVEL SECURITY',r.relname); END IF;
    FOR g IN SELECT DISTINCT x.grantee FROM pg_class c CROSS JOIN LATERAL aclexplode(COALESCE(c.relacl,acldefault(CASE WHEN c.relkind='S' THEN 'S'::"char" ELSE 'r'::"char" END,c.relowner))) x WHERE c.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_customer_owner') LOOP
      EXECUTE format('REVOKE ALL ON %s tll_customer_private.%I FROM %s',CASE WHEN r.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,r.relname,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR r IN SELECT p.oid,p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_customer_private' LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO tll_customer_owner',r.signature);
    FOR g IN SELECT DISTINCT x.grantee FROM pg_proc p CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) x WHERE p.oid=r.oid AND x.grantee<>(SELECT oid FROM pg_roles WHERE rolname='tll_customer_owner') LOOP
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
    END LOOP;
  END LOOP;
  FOR g IN SELECT DISTINCT x.grantee FROM pg_namespace n CROSS JOIN LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) x WHERE n.nspname='tll_customer_private' AND x.grantee<>n.nspowner LOOP
    EXECUTE format('REVOKE ALL ON SCHEMA tll_customer_private FROM %s',CASE WHEN g.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(g.grantee)) END);
  END LOOP;
END
$acl$;
GRANT USAGE ON SCHEMA tll_customer_private TO tll_customer_executor;
GRANT EXECUTE ON FUNCTION tll_customer_private.repository(text,jsonb) TO tll_customer_executor;
DO $operator_grants$
BEGIN
  EXECUTE format('GRANT USAGE ON SCHEMA tll_customer_private TO %I',current_user);
  EXECUTE format('GRANT EXECUTE ON FUNCTION tll_customer_private.operator_status(), tll_customer_private.operator_set_enabled(boolean,text) TO %I',current_user);
END
$operator_grants$;
DO $postflight$
DECLARE r record; b record; fnrow record;
BEGIN
  IF (SELECT enabled FROM tll_customer_private.control) IS DISTINCT FROM false OR EXISTS(SELECT FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_customer_owner','tll_customer_executor')) AND member NOT IN (SELECT oid FROM pg_roles WHERE rolname IN (current_user,'tll_customer_role_setup'))) THEN
    RAISE EXCEPTION 'Unexpected activation or remaining role membership'; END IF;
  FOR b IN SELECT oid,rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role','tll_customer_executor') LOOP
    IF has_schema_privilege(b.oid,'tll_customer_private','CREATE') OR (b.rolname<>'tll_customer_executor' AND has_schema_privilege(b.oid,'tll_customer_private','USAGE')) THEN RAISE EXCEPTION 'Unexpected effective schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_customer_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(b.oid,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected effective private table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(b.oid,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_customer_private' LOOP
      IF has_function_privilege(b.oid,fnrow.oid,'EXECUTE') IS DISTINCT FROM (b.rolname='tll_customer_executor' AND fnrow.proname='repository') THEN RAISE EXCEPTION 'Unexpected effective function authority'; END IF;
    END LOOP;
  END LOOP;
END
$postflight$;
DO $retire_authority$
DECLARE migration_role name:=current_user; r record; fnrow record;
BEGIN
  IF EXISTS(SELECT FROM pg_roles WHERE rolname='tll_customer_role_setup') THEN
    SET LOCAL ROLE tll_customer_role_setup;
    EXECUTE format('REVOKE tll_customer_owner FROM %I',migration_role);
    EXECUTE format('SET LOCAL ROLE %I',migration_role);
    DROP ROLE tll_customer_role_setup;
  ELSE
    EXECUTE format('REVOKE tll_customer_owner FROM %I',migration_role);
  END IF;
  IF EXISTS(SELECT FROM pg_auth_members WHERE roleid IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_customer_owner','tll_customer_executor')) OR member IN (SELECT oid FROM pg_roles WHERE rolname IN ('tll_customer_owner','tll_customer_executor'))) THEN
    RAISE EXCEPTION 'Temporary repository role membership remains'; END IF;
  -- The non-superuser operator retains only USAGE and the two narrow functions.
  -- Administrators may have inherent platform authority; no such grants are added.
  IF NOT (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    IF has_schema_privilege(current_user,'tll_customer_private','CREATE') OR NOT has_schema_privilege(current_user,'tll_customer_private','USAGE') THEN
      RAISE EXCEPTION 'Unexpected operator schema authority'; END IF;
    FOR r IN SELECT c.oid,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='tll_customer_private' AND c.relkind IN ('r','S') LOOP
      IF r.relkind='r' AND (has_table_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
        OR has_any_column_privilege(current_user,r.oid,'SELECT,INSERT,UPDATE,REFERENCES')) THEN RAISE EXCEPTION 'Unexpected operator table/column authority'; END IF;
      IF r.relkind='S' AND has_sequence_privilege(current_user,r.oid,'USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Unexpected operator sequence authority'; END IF;
    END LOOP;
    FOR fnrow IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='tll_customer_private' LOOP
      IF has_function_privilege(current_user,fnrow.oid,'EXECUTE') IS DISTINCT FROM (fnrow.proname IN ('operator_status','operator_set_enabled')) THEN
        RAISE EXCEPTION 'Unexpected operator function authority'; END IF;
    END LOOP;
  END IF;
END
$retire_authority$;
COMMIT;
