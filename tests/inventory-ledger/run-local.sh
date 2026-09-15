#!/usr/bin/env bash
# No hosted DB, port publication, Shopify calls or real credentials.
set -euo pipefail
cd "$(dirname "$0")/../.."
if [[ -n "${TLL_INVENTORY_TEST_CONTAINER:-}" ]]; then
  [[ "$TLL_INVENTORY_TEST_CONTAINER" == tll-stage0-postgres ]] || { echo 'Existing container not allowlisted' >&2; exit 1; }
  fixture="$TLL_INVENTORY_TEST_CONTAINER"
  cleanup() {
    docker exec "$fixture" psql -X -q -U postgres -d tll_inventory_ledger -v ON_ERROR_STOP=1 -c \
      "update tll_inventory_private.control set enabled=false where current_database()='tll_inventory_ledger' and exists(select from public.tll_inventory_test_marker where marker='synthetic-inventory-ledger-v1');" >/dev/null 2>&1 || true
  }
  trap cleanup EXIT
else
  [[ "$(uname -s)" == Linux ]] || { echo 'New fixture containers require Linux; use the approved existing local fixture on macOS' >&2; exit 1; }
  fixture="tll-inventory-ci-$$"
  cleanup() { docker rm -f "$fixture" >/dev/null 2>&1 || true; }
  trap cleanup EXIT
  docker run -d --name "$fixture" --network none -e POSTGRES_DB=tll_inventory_ledger \
    -e POSTGRES_PASSWORD=tll-synthetic-inventory-only postgres:17-alpine >/dev/null
  for attempt in {1..30}; do
    if docker exec "$fixture" pg_isready -h 127.0.0.1 -U postgres -d tll_inventory_ledger >/dev/null 2>&1; then break; fi
    sleep 1
  done
  docker exec "$fixture" pg_isready -h 127.0.0.1 -U postgres -d tll_inventory_ledger >/dev/null
  docker exec "$fixture" psql -X -U postgres -d tll_inventory_ledger -v ON_ERROR_STOP=1 -c \
    "create table public.tll_inventory_test_marker(marker text primary key); insert into public.tll_inventory_test_marker values('synthetic-inventory-ledger-v1');" >/dev/null
fi
TLL_INVENTORY_TEST_CONTAINER="$fixture" python3 tests/inventory-ledger/acceptance.py
TLL_INVENTORY_TEST_CONTAINER="$fixture" node --experimental-strip-types tests/inventory-ledger/worker-postgres.mjs
