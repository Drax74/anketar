#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
docker_local() {
    env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH \
        docker --host=unix:///var/run/docker.sock "$@"
}
db_container="anketar-policy-test-$$"
trap 'docker_local rm -f "$db_container" >/dev/null 2>&1 || true' EXIT
# Isolated test database: no published ports, no network, no production secrets.
docker_local run --rm -d --network none --name "$db_container" \
    -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null
for attempt in {1..30}; do
    if docker_local exec "$db_container" pg_isready -U postgres >/dev/null 2>&1; then break; fi
    if [ "$attempt" = 30 ]; then echo 'PostgreSQL did not become ready' >&2; exit 1; fi
    sleep 1
done
run_sql() { docker_local exec -i "$db_container" psql -X -U postgres -v ON_ERROR_STOP=1 -q < "$1"; }
run_sql supabase/tests/bootstrap.sql
run_sql supabase/migrations/202611010001_availability_roles.sql
run_sql supabase/migrations/202611010001_availability_roles.sql
run_sql supabase/admin/assign_super_admin.sql
run_sql supabase/migrations/202611010001_availability_roles.sql
run_sql supabase/tests/availability_roles.sql
# Existing unknown restrictive policies must cause a clear, atomic failure.
docker_local exec -i "$db_container" psql -X -U postgres -v ON_ERROR_STOP=1 -q <<'SQL'
create policy fixture_restrictive on public.options as restrictive for update to authenticated using (true);
SQL
policy_log="$(mktemp)"
if run_sql supabase/migrations/202611010001_availability_roles.sql >"$policy_log" 2>&1; then
    rm -f "$policy_log"
    echo 'Migration unexpectedly accepted an unknown restrictive policy' >&2
    exit 1
fi
if ! rg -q 'Review existing restrictive UPDATE/ALL policies' "$policy_log"; then
    cat "$policy_log" >&2
    rm -f "$policy_log"
    exit 1
fi
rm -f "$policy_log"
echo 'PASS: unknown restrictive policies require review'
