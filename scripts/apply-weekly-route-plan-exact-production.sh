#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
APPLY=/tmp/kcs-route-exact-apply.json
NOOP=/tmp/kcs-route-exact-noop.json
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"

install -d -m 750 /var/lib/kcs/data/backups
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"
SCHEMA="$(sqlite3 "$DB" 'SELECT COALESCE(MAX(version),0) FROM schema_meta;')"
test "$SCHEMA" = "50"
BEFORE="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1;')"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-route-exact-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$BACKUP" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"

APPLIED=0
DATA_OK=0
systemctl stop kcs-api
cleanup(){
  STATUS=$?
  trap - EXIT
  if [ "$STATUS" -ne 0 ] && [ "$APPLIED" = "1" ] && [ "$DATA_OK" = "0" ]; then
    sqlite3 "$DB" ".restore \"$BACKUP\"" || true
  fi
  systemctl start kcs-api || true
  exit "$STATUS"
}
trap cleanup EXIT

env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-exact.mjs" --apply >"$APPLY"
APPLIED=1
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.after.matchesExact===true&&r.after.routeCount===691&&r.after.currentHash===r.after.expectedHash&&r.entryCount===691&&r.branchCount===328&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$APPLY"

env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-exact.mjs" --apply >"$NOOP"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.noOp===true&&r.before.matchesExact===true&&r.after.matchesExact===true&&r.after.routeCount===691&&r.after.currentHash===r.after.expectedHash&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$NOOP"

ROUTES="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1;')"
test "$ROUTES" = "691"
QM630S="$(sqlite3 "$DB" "SELECT GROUP_CONCAT(n,',') FROM (SELECT d.weekday,COUNT(s.branch_id) n FROM (SELECT 0 weekday UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) d LEFT JOIN weekly_route_plan_stops s ON s.weekday=d.weekday AND s.vehicle_registration_number='QM630S' AND s.plan_id=(SELECT id FROM weekly_route_plans WHERE is_active=1) GROUP BY d.weekday ORDER BY d.weekday);")"
test "$QM630S" = "2,21,19,20,21,20,19"
test "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = "ok"
test "$(sqlite3 "$DB" 'SELECT COUNT(*) FROM pragma_foreign_key_check;')" = "0"
DATA_OK=1

systemctl start kcs-api
trap - EXIT
INTERNAL=""
for _ in $(seq 1 30); do
  INTERNAL="$(curl --fail --silent http://127.0.0.1:8787/api/health || true)"
  if [ -n "$INTERNAL" ]; then break; fi
  sleep 2
done
test -n "$INTERNAL"
PUBLIC=""
for _ in $(seq 1 15); do
  PUBLIC="$(curl --fail --silent https://dispatch.leesaiker.com/api/health || true)"
  if [ -n "$PUBLIC" ]; then break; fi
  sleep 2
done
test -n "$PUBLIC"
SERVICE="$(systemctl is-active kcs-api)"
test "$SERVICE" = "active"

echo "SERVICE=$SERVICE"
echo "HEAD=$HEAD"
echo "SCHEMA=$SCHEMA"
echo "BEFORE_ROUTE_COUNT=$BEFORE"
echo "BACKUP=$BACKUP"
echo "BACKUP_SHA256=$BACKUP_SHA256"
echo "EXCEL_EXACT_MATCH=true"
echo "SECOND_APPLY=no-op"
echo "ROUTE_COUNT=$ROUTES"
echo "QM630S_SUN_TO_SAT=$QM630S"
echo "INTEGRITY=ok"
echo "FOREIGN_KEY_ERRORS=0"
echo "INTERNAL_HEALTH=$INTERNAL"
echo "PUBLIC_HEALTH=$PUBLIC"
echo "DEPLOYMENT=ok"
