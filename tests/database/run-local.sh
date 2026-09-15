#!/usr/bin/env bash
# Creates and removes ONLY uniquely named synthetic Docker fixtures. No hosted DB.
set -euo pipefail
cd "$(dirname "$0")/../.."

fixture="tll-stage0-ci-$$"
api="${fixture}-api"
network="${fixture}-net"
cleanup() {
  docker rm -f "$api" "$fixture" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker network create "$network" >/dev/null
docker run -d --name "$fixture" --network "$network" \
  -e POSTGRES_DB=tll_stage0 -e POSTGRES_PASSWORD=tll-local-synthetic-only \
  postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$fixture" pg_isready -U postgres -d tll_stage0 >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$fixture" pg_isready -U postgres -d tll_stage0
docker exec "$fixture" mkdir -p /tmp/tll-integrity/tests /tmp/tll-integrity/supabase
docker cp scripts "$fixture":/tmp/tll-integrity/scripts >/dev/null
docker cp tests/database "$fixture":/tmp/tll-integrity/tests/database >/dev/null
docker cp supabase/migrations "$fixture":/tmp/tll-integrity/supabase/migrations >/dev/null
psql_fixture() {
  docker exec -i "$fixture" psql -X -U postgres -d tll_stage0 -v ON_ERROR_STOP=1 "$@"
}
psql_fixture -f /tmp/tll-integrity/tests/database/bootstrap.sql
# Apply twice to prove replay preserves the same boundary.
for replay in 1 2; do
  psql_fixture -f /tmp/tll-integrity/supabase/migrations/202609150001_integrity_boundaries.sql
  psql_fixture -f /tmp/tll-integrity/tests/database/acceptance.sql
  psql_fixture -f /tmp/tll-integrity/tests/database/review-regressions.sql
done
TLL_TEST_CONTAINER="$fixture" python3 tests/database/concurrency.py
psql_fixture <<'SQL'
create role tll_test_authenticator noinherit login password 'tll-local-synthetic-only';
grant anon, authenticated to tll_test_authenticator;
SQL
docker run -d --name "$api" --network "$network" -p 127.0.0.1::3000 \
  -e "PGRST_DB_URI=postgres://tll_test_authenticator:tll-local-synthetic-only@${fixture}:5432/tll_stage0" \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=tll-stage0-local-jwt-secret-synthetic-only-2026 \
  postgrest/postgrest:v16.3 >/dev/null
port="$(docker port "$api" 3000/tcp | sed 's/^127\.0\.0\.1://')"
[[ "$port" =~ ^[0-9]+$ ]] || { echo 'Unexpected fixture port mapping' >&2; exit 1; }
endpoint="http://127.0.0.1:${port}"
for attempt in {1..30}; do
  if curl --fail --silent "$endpoint/products?select=id" >/dev/null; then break; fi
  sleep 1
done
curl --fail --silent "$endpoint/products?select=id" >/dev/null
LOCAL_POSTGREST_URL="$endpoint" node --test tests/database/postgrest.test.mjs
