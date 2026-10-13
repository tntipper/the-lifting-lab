#!/usr/bin/env bash
# Disposable Docker only. Never reads application env files or accepts a DB URL.
# Usage: scripts/rehearse-catalogue-merge.sh [fixture-export] [results-file]
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
FIXTURE=${1:-"$ROOT/../prod-dupes.json.txt"}
RESULT=${2:-"$HOME/tll-migration/grok-runs/k-result.txt"}
NAME=tll-k-rehearsal
TMP=$(mktemp -d)
OWNED=0
mkdir -p "$(dirname "$RESULT")"
: > "$RESULT"
report() { printf '%s\n' "$*" | tee -a "$RESULT"; }
cleanup() {
  rc=$?
  if (( OWNED )); then docker logs "$NAME" > "$TMP/docker.log" 2>&1 || true; fi
  if (( OWNED )); then
    if docker rm -fv "$NAME" > "$TMP/cleanup.log" 2>&1; then report 'PASS container removed (including anonymous volumes)';
    else report 'FAIL container removal'; rc=1; fi
  fi
  if (( rc )); then report "FAIL rehearsal stopped; diagnostic files: $TMP";
  else report "PASS rehearsal complete; diagnostic files: $TMP"; fi
  exit "$rc"
}
trap cleanup EXIT
if docker container inspect "$NAME" > /dev/null 2>&1; then report 'FAIL container name already exists; refusing to remove it'; exit 1; fi
IMAGE=supabase/postgres:17.6.1.054
if ! docker image inspect "$IMAGE" > /dev/null 2>&1 && ! docker pull "$IMAGE" > "$TMP/pull.log" 2>&1; then
  report 'PASS fallback to postgres:17 (Supabase image unavailable; fixture roles supplied)'
  IMAGE=postgres:17
fi
# Supabase image postgres is deliberately not a superuser.
ADMIN=postgres
if [[ "$IMAGE" == supabase/* ]]; then ADMIN=supabase_admin; fi
# No published ports, external network, host mounts or production credentials.
docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=tll-disposable-only "$IMAGE" > "$TMP/container-id"
OWNED=1
for ((i=0;i<60;i++)); do
  if docker exec "$NAME" sh -c 'tr "\0" " " < /proc/1/cmdline | grep -qE "^(/usr/bin/)?postgres " && pg_isready -U postgres' > /dev/null 2>&1; then break; fi
  sleep 1
done
if [[ "$IMAGE" == supabase/* ]] && ! docker exec -e PGPASSWORD=tll-disposable-only "$NAME" psql -w -U "$ADMIN" -d postgres -Atc 'SELECT rolsuper FROM pg_roles WHERE rolname=current_user' > "$TMP/admin-probe.log" 2>&1; then
  report 'FAIL preferred Supabase image admin probe (stock postgres role restricted; supabase_admin credential unavailable)'
  docker logs "$NAME" > "$TMP/supabase-image.log" 2>&1
  docker rm -fv "$NAME" > /dev/null
  OWNED=0
  IMAGE=postgres:17
  ADMIN=postgres
  docker run -d --name "$NAME" --network none -e POSTGRES_PASSWORD=tll-disposable-only "$IMAGE" > "$TMP/container-id"
  OWNED=1
  for ((i=0;i<60;i++)); do
    if docker exec "$NAME" sh -c 'tr "\0" " " < /proc/1/cmdline | grep -qE "^(/usr/bin/)?postgres " && pg_isready -U postgres' > /dev/null 2>&1; then break; fi
    sleep 1
  done
  report 'PASS permitted postgres:17 fallback; fixture creates anon/authenticated/service_role'
fi
sql() { docker exec -e PGPASSWORD=tll-disposable-only -i "$NAME" psql -h 127.0.0.1 -w -X -q -v ON_ERROR_STOP=1 -U "${DBUSER:-$ADMIN}" -d tll_stage0 "$@"; }
docker exec -e PGPASSWORD=tll-disposable-only "$NAME" createdb -w -U "$ADMIN" tll_stage0
report "PASS disposable PostgreSQL started: $IMAGE; network none; no host ports"
# Copy only legacy SQL dependencies; the repository bootstrap supplies accounts,
# public RLS and auth.uid. Fixture shims never alter migration source.
docker exec "$NAME" mkdir -p /rehearsal/scripts /rehearsal/tests/database
for legacy in accounts-01-schema.sql accounts-02-functions.sql accounts-03-seed.sql accounts-04-referral-fn.sql accounts-05-reviews-fn.sql accounts-07-account-fn.sql accounts-08-security-patch.sql accounts-09-points-hardening.sql favourites.sql create-submission-tables.sql; do
  docker cp "$ROOT/scripts/$legacy" "$NAME:/rehearsal/scripts/$legacy" > /dev/null
done
python3 - "$ROOT" "$TMP" "$FIXTURE" <<'PY'
import json, pathlib, re, sys
root,tmp,fixture=map(pathlib.Path,sys.argv[1:])
baseline=(root/'tests/database/bootstrap.sql').read_text().split('insert into auth.users(id,email,created_at) values')[0]
baseline=baseline.replace('grant anon, authenticated, service_role to current_user;', '-- Fixture shim: no unnecessary role grant (Supabase image GRANT crashes).')
(tmp/'bootstrap.sql').write_text(baseline)
raw=fixture.read_text()
try:
    data=json.loads(raw)
except json.JSONDecodeError:
    data=json.JSONDecoder().raw_decode(raw[raw.index('{"result"'):])[0]
if 'result' in data:
    payload=data['result']; start=payload.index('[{"d":')
    data=json.JSONDecoder().raw_decode(payload[start:])[0][0]['d']
assert len(data['products'])==6 and len(data['nutrients'])==19
# JSON is data only: use PostgreSQL JSON record population, no exported instructions.
seed=[]
for table,key in [('products','products'),('product_nutrients','nutrients')]:
    value=json.dumps(data[key]).replace("'","''")
    seed.append(f"INSERT INTO public.{table} SELECT * FROM jsonb_populate_recordset(NULL::public.{table}, '{value}'::jsonb);")
(tmp/'seed.sql').write_text('\n'.join(seed))
PY
docker cp "$TMP/bootstrap.sql" "$NAME:/rehearsal/tests/database/bootstrap.sql" > /dev/null
sql -f /rehearsal/tests/database/bootstrap.sql > "$TMP/bootstrap.log" 2>&1
sql > "$TMP/shims.log" 2>&1 <<'SQL'
-- Legacy catalogue fields absent from the small existing bootstrap.
ALTER TABLE public.products ADD category text, ADD barcode text, ADD serving_size numeric,
 ADD serving_unit text, ADD servings_per_container integer, ADD image_url text,
 ADD created_at timestamptz DEFAULT now(), ADD updated_at timestamptz DEFAULT now(),
 ADD informed_sport boolean, ADD proprietary_blend boolean, ADD amino_spiked boolean, ADD protein_yield numeric;
ALTER TABLE public.product_nutrients DROP CONSTRAINT product_nutrients_product_id_fkey;
ALTER TABLE public.product_nutrients ADD FOREIGN KEY(product_id) REFERENCES public.products ON DELETE CASCADE,
 ADD nutrient_name text, ADD unit text, ADD per_serving boolean, ADD created_at timestamptz DEFAULT now();
ALTER TABLE public.user_stacks ADD name text NOT NULL DEFAULT 'My Stack', ADD is_active boolean DEFAULT true,
 ADD created_at timestamptz DEFAULT now(), ADD updated_at timestamptz DEFAULT now();
ALTER TABLE public.stack_products ADD servings_per_day numeric DEFAULT 1, ADD added_at timestamptz DEFAULT now();
CREATE SCHEMA extensions;
CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
CREATE ROLE tll_rehearsal_migrator LOGIN CREATEROLE NOINHERIT PASSWORD 'tll-disposable-only';
GRANT CREATE ON DATABASE tll_stage0 TO tll_rehearsal_migrator;
GRANT USAGE ON SCHEMA auth TO tll_rehearsal_migrator WITH GRANT OPTION;
GRANT USAGE, CREATE ON SCHEMA public TO tll_rehearsal_migrator WITH GRANT OPTION;
GRANT ALL ON ALL TABLES IN SCHEMA public, auth TO tll_rehearsal_migrator WITH GRANT OPTION;
-- Historical cart guard requires a synthetic staging marker and session settings.
CREATE SCHEMA tll_staging_private;
GRANT USAGE ON SCHEMA tll_staging_private TO tll_rehearsal_migrator;
CREATE TABLE tll_staging_private.environment(singleton boolean, environment text, operator_project_ref text, identity_basis text);
GRANT SELECT ON tll_staging_private.environment TO tll_rehearsal_migrator;
INSERT INTO tll_staging_private.environment VALUES(true,'tll-hosted-staging-v1','kkkkkkkkkkkkkkkkkkkk','explicit-operator-dashboard-binding');
ALTER DATABASE tll_stage0 SET tll.cart_migration_environment='staging';
ALTER DATABASE tll_stage0 SET tll.cart_expected_project_ref='kkkkkkkkkkkkkkkkkkkk';
SQL
report 'PASS fixture-only legacy schema, pgcrypto, cart context and nonsuperuser installer shims'
for migration in "$ROOT"/supabase/migrations/*.sql; do
  file=$(basename "$migration")
  DBUSER=$ADMIN
  case "$file" in 202609150001_*|202609150002_*|202609150003_*) ;; *) DBUSER=tll_rehearsal_migrator;; esac
  if sql < "$migration" > "$TMP/$file.log" 2>&1; then report "PASS migration $file";
  else report "FAIL migration $file (see $TMP/$file.log)"; cat "$TMP/$file.log"; exit 1; fi
done
DBUSER=$ADMIN
sql < "$TMP/seed.sql" > "$TMP/seed.log" 2>&1
sql >> "$TMP/seed.log" 2>&1 <<'SQL'
INSERT INTO auth.users(id,email) VALUES
 ('10000000-0000-4000-8000-000000000001','child-only@example.invalid'),
 ('10000000-0000-4000-8000-000000000002','both@example.invalid');
CREATE TABLE public.rehearsal_pairs(parent uuid,child uuid);
INSERT INTO public.rehearsal_pairs VALUES
 ('1fab2546-6a25-4fd9-8e49-abf6bb6b362c','8ddfc493-0872-4235-ba25-5091ef172b49'),
 ('e94b13c4-f7fa-42d2-94b2-8dfcda316311','b9058eef-f71a-49f7-9672-a264d1a09614'),
 ('2567a955-be92-4f70-b147-f908fa80650c','60cbe489-96a8-416e-a11b-243e3277caf3');
INSERT INTO public.reviews(user_id,product_id,rating,body) SELECT '10000000-0000-4000-8000-000000000001',child,4,'Synthetic child review' FROM public.rehearsal_pairs;
INSERT INTO public.user_favourites(user_id,product_id) SELECT '10000000-0000-4000-8000-000000000001',child FROM public.rehearsal_pairs;
INSERT INTO public.user_favourites(user_id,product_id) SELECT '10000000-0000-4000-8000-000000000002',p FROM public.rehearsal_pairs CROSS JOIN LATERAL unnest(ARRAY[parent,child]) p;
INSERT INTO public.user_stacks(id,user_id,name) VALUES
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Parent and child'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Child only');
INSERT INTO public.stack_products(stack_id,product_id,servings_per_day) SELECT '30000000-0000-4000-8000-000000000001',p,2 FROM public.rehearsal_pairs CROSS JOIN LATERAL unnest(ARRAY[parent,child]) p;
INSERT INTO public.stack_products(stack_id,product_id,servings_per_day) SELECT '30000000-0000-4000-8000-000000000002',child,1 FROM public.rehearsal_pairs;
SQL
report 'PASS seed six exact products / 19 nutrients; three child reviews; child-only and colliding favourites/stacks'
snapshot() {
  for table in products product_nutrients reviews user_favourites stack_products user_stacks product_size_options tll_merge_private.merged_product_archive; do
    sql -Atc "SELECT '$table:' || COALESCE(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text), '[]'::jsonb)::text FROM $table t;"
  done
}
snapshot > "$TMP/pre.jsonl"
sql < "$ROOT/supabase/operator/2026-10-13-merge-duplicate-products.sql" > "$TMP/merge.log" 2>&1
report 'PASS operator merge execution'
check() {
  local label=$1 query=$2 actual
  actual=$(sql -Atc "$query")
  if [[ "$actual" == t ]]; then report "PASS $label"; else report "FAIL $label (actual: $actual)"; exit 1; fi
}
check 'four size rows and exact prices/Shopify variants' "SELECT count(*)=4 AND bool_and(retail_price=CASE slug WHEN '12-pack' THEN 23.99 WHEN 'single-bar' THEN 2.00 WHEN '40-servings' THEN 29.99 WHEN '16-servings' THEN 19.99 END AND shopify_variant_id IS NOT DISTINCT FROM CASE WHEN slug='12-pack' THEN 'gid://shopify/ProductVariant/63535202468170' END) FROM product_size_options"
check 'children deleted; three full archives present' "SELECT (SELECT count(*) FROM products)=3 AND (SELECT count(*) FROM tll_merge_private.merged_product_archive)=3 AND NOT EXISTS(SELECT FROM products JOIN rehearsal_pairs ON id=child)"
check 'child reviews moved with original IDs and bodies' "SELECT count(*)=3 AND bool_and(product_id IN (SELECT parent FROM rehearsal_pairs) AND body='Synthetic child review') FROM reviews"
check 'child-only favourites moved; both favourites deduplicated' "SELECT count(*)=6 AND count(DISTINCT (user_id,product_id))=6 AND bool_and(product_id IN(SELECT parent FROM rehearsal_pairs)) FROM user_favourites"
check 'stack moves and collisions sum servings' "SELECT count(*)=6 AND bool_and(product_id IN(SELECT parent FROM rehearsal_pairs) AND servings_per_day=CASE WHEN stack_id='30000000-0000-4000-8000-000000000001' THEN 4 ELSE 1 END) FROM stack_products"
check 'EssentialMAX category eaas / serving 15g' "SELECT name='EssentialMAX' AND category='eaas' AND serving_size=15 AND serving_unit='g' FROM products WHERE id='2567a955-be92-4f70-b147-f908fa80650c'"
check 'anon can SELECT all four active sizes' "SET ROLE anon; SELECT count(*)=4 FROM product_size_options"
if sql -c 'SET ROLE anon; SELECT * FROM tll_merge_private.merged_product_archive' > "$TMP/anon-archive.log" 2>&1; then
 report 'FAIL anon archive read unexpectedly allowed'; exit 1
elif rg -q 'permission denied' "$TMP/anon-archive.log"; then report 'PASS anon archive SELECT denied';
else report 'FAIL anon archive denial was not a permission error'; exit 1; fi
snapshot > "$TMP/merged.jsonl"
sql < "$ROOT/supabase/operator/2026-10-13-merge-duplicate-products.sql" > "$TMP/merge-rerun.log" 2>&1
snapshot > "$TMP/merge-rerun.jsonl"
diff -u "$TMP/merged.jsonl" "$TMP/merge-rerun.jsonl" > "$TMP/merge-rerun.diff" || { report 'FAIL operator rerun changed state'; exit 1; }
report 'PASS operator rerun exact no-op'
# Regression: a later stack edit must cause an atomic rollback refusal.
sql -c "UPDATE user_stacks SET revision=revision+1 WHERE id='30000000-0000-4000-8000-000000000001'" > /dev/null
snapshot > "$TMP/edited-stack.jsonl"
if sql < "$ROOT/supabase/operator/2026-10-13-merge-duplicate-products.rollback.sql" > "$TMP/rollback-guard.log" 2>&1; then
  report 'FAIL rollback accepted a later stack edit'; exit 1
elif ! rg -q 'Rollback stack metadata changed or missing' "$TMP/rollback-guard.log"; then
  report 'FAIL rollback refused for an unexpected reason'; exit 1
fi
snapshot > "$TMP/guard-rejected.jsonl"
diff -u "$TMP/edited-stack.jsonl" "$TMP/guard-rejected.jsonl" > "$TMP/guard.diff" || { report 'FAIL refused rollback changed state'; exit 1; }
sql -c "UPDATE user_stacks SET revision=revision-1 WHERE id='30000000-0000-4000-8000-000000000001'" > /dev/null
report 'PASS later stack edit blocks rollback atomically'
sql < "$ROOT/supabase/operator/2026-10-13-merge-duplicate-products.rollback.sql" > "$TMP/rollback.log" 2>&1
snapshot > "$TMP/restored.jsonl"
diff -u "$TMP/pre.jsonl" "$TMP/restored.jsonl" > "$TMP/rollback.diff" || { report "FAIL rollback exact pre-snapshot diff (see $TMP/rollback.diff)"; exit 1; }
report 'PASS rollback exact originals including nutrients, relationships and stack metadata; sizes/archive empty'
sql < "$ROOT/supabase/operator/2026-10-13-merge-duplicate-products.rollback.sql" > "$TMP/rollback-rerun.log" 2>&1
snapshot > "$TMP/rollback-rerun.jsonl"
diff -u "$TMP/restored.jsonl" "$TMP/rollback-rerun.jsonl" > "$TMP/rollback-rerun.diff" || { report 'FAIL rollback rerun changed state'; exit 1; }
report 'PASS rollback rerun exact no-op'
report 'PASS boundaries: no Supabase endpoints, no push, no signoff workbook access'
