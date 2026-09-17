#!/usr/bin/env bash
# Fresh GitHub-hosted Linux fixture only. Never adopt the owner's local container.
set -euo pipefail
cd "$(dirname "$0")/../.."

if [[ "${GITHUB_ACTIONS:-}" != true || "${RUNNER_OS:-}" != Linux || "${RUNNER_ENVIRONMENT:-}" != github-hosted ]]; then
  echo 'This fixture creator requires a disposable GitHub-hosted Linux runner.' >&2
  exit 1
fi
if [[ -n "${DOCKER_HOST:-}" && "${DOCKER_HOST}" != unix://* ]]; then
  echo 'Remote Docker endpoint refused.' >&2
  exit 1
fi
endpoint="$(docker context inspect --format '{{(index .Endpoints "docker").Host}}')"
[[ "$endpoint" == unix://* ]] || { echo 'Local Docker socket required.' >&2; exit 1; }
fixture=tll-stage0-postgres
if docker container inspect "$fixture" >/dev/null 2>&1; then
  echo 'Existing container refused; no replacement or cleanup attempted.' >&2
  exit 1
fi
owner="$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
cleanup() {
  # A failed/uncertain create may still have created the named container. Its
  # unique label is required before removal; no other container is adopted.
  local actual
  actual="$(docker inspect --format '{{index .Config.Labels "tll.repository-ci-owner"}}' "$fixture" 2>/dev/null || true)"
  if [[ "$actual" == "$owner" ]]; then docker rm -fv "$fixture" >/dev/null; fi
}
trap cleanup EXIT
docker run -d --name "$fixture" --label "tll.repository-ci-owner=$owner" \
  -p 127.0.0.1:55432:5432 -e POSTGRES_PASSWORD=tll-local-synthetic-only \
  postgres:17-alpine >/dev/null
for attempt in {1..30}; do
  if docker exec "$fixture" pg_isready -h 127.0.0.1 -U postgres -d postgres >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec "$fixture" pg_isready -h 127.0.0.1 -U postgres -d postgres
docker exec -i "$fixture" psql -Xq -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
SQL
node tests/customer-repository/setup.mjs --create-once
node tests/customer-repository/migration-regression.mjs
node --experimental-strip-types --test tests/customer-repository/acceptance.test.mjs
node tests/staging-postgres/local-acceptance.mjs
python3 tests/staging-cart/acceptance.py
node tests/subject-broker-repository/setup.mjs --create-once
node tests/subject-broker-repository/migration-regression.mjs
node --experimental-strip-types --test tests/subject-broker-repository/acceptance.test.mjs
