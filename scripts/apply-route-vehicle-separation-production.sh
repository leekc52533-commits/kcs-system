#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
START="${ROUTE_REFRESH_START:-2026-09-07}"
[[ "$START" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]]
MIGRATION=/tmp/kcs-route-v51-migration.json
PLAN=/tmp/kcs-route-v51-plan.json
REFRESH=/tmp/kcs-route-v51-refresh.json
VERIFY=/tmp/kcs-route-v51-verify.json

HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"
BEFORE_SCHEMA="$(sqlite3 "$DB" 'SELECT COALESCE(MAX(version),0) FROM schema_meta;')"
test "$BEFORE_SCHEMA" = "50" -o "$BEFORE_SCHEMA" = "51"
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-route-v51-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"

# Build the versioned frontend before touching production data. A failed build
# must leave both the running service and database unchanged.
runuser -u ubuntu -- npm --prefix "$APP" run build

APPLIED=0
DATA_OK=0
systemctl stop kcs-api
cleanup(){ STATUS=$?;trap - EXIT;if [ "$STATUS" -ne 0 ] && [ "$APPLIED" = "1" ] && [ "$DATA_OK" = "0" ];then sqlite3 "$DB" ".restore \"$BACKUP\"" || true;fi;systemctl start kcs-api || true;exit "$STATUS"; }
trap cleanup EXIT

env KCS_DB_PATH="$DB" node "$APP/scripts/migrate-v51.mjs" >"$MIGRATION"
APPLIED=1
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!(r.schemaVersion===51&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$MIGRATION"
env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-exact.mjs" --apply >"$PLAN"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!(r.after.matchesExact&&r.after.routeCount===665&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$PLAN"
# Existing draft/reapproval rows were historically assigned by vehicle. Remove
# only those future, editable assignments so Route 1-5 can be assigned afresh.
# Approved/published/in-progress/completed dates remain untouched.
sqlite3 "$DB" "DELETE FROM daily_route_assignments WHERE dispatch_day_id IN (SELECT id FROM dispatch_days WHERE dispatch_date >= '$START' AND status NOT IN ('approved','published','in_progress','completed'));"
env KCS_DB_PATH="$DB" ROUTE_REFRESH_START="$START" node "$APP/scripts/refresh-weekly-route-arrange.mjs" >"$REFRESH"
env KCS_DB_PATH="$DB" ROUTE_REFRESH_START="$START" node "$APP/scripts/verify-route-vehicle-separation.mjs" >"$VERIFY"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!(r.routeCount===665&&r.missingRouteNumbers===0&&r.allRoutesValid===true&&r.integrity==="ok"&&r.foreignKeyErrors===0&&r.templateCounts["Route 1"].join(",")==="0,15,19,17,20,18,13"&&r.templateCounts["Route 2"].join(",")==="0,27,27,24,26,29,25"&&r.templateCounts["Route 3"].join(",")==="4,23,21,22,21,22,24"&&r.templateCounts["Route 4"].join(",")==="13,24,23,19,19,19,18"&&r.templateCounts["Route 5"].join(",")==="8,19,22,29,16,19,20"))process.exit(1)' "$VERIFY"
DATA_OK=1

systemctl start kcs-api
trap - EXIT
INTERNAL=""
for _ in $(seq 1 30);do INTERNAL="$(curl --fail --silent http://127.0.0.1:8787/api/health || true)";if [ -n "$INTERNAL" ];then break;fi;sleep 2;done
test -n "$INTERNAL"
PUBLIC="$(curl --fail --silent https://dispatch.leesaiker.com/api/health)"
test "$(systemctl is-active kcs-api)" = "active"

echo "SERVICE=active"
echo "HEAD=$HEAD"
echo "SCHEMA=51"
echo "FRONTEND_BUILD=ok"
echo "BACKUP=$BACKUP"
echo "BACKUP_SHA256=$BACKUP_SHA256"
echo "ROUTE_COUNT=665"
echo "ROUTE_1_SUN_TO_SAT=0,15,19,17,20,18,13"
echo "ROUTE_2_SUN_TO_SAT=0,27,27,24,26,29,25"
echo "ROUTE_3_SUN_TO_SAT=4,23,21,22,21,22,24"
echo "ROUTE_4_SUN_TO_SAT=13,24,23,19,19,19,18"
echo "ROUTE_5_SUN_TO_SAT=8,19,22,29,16,19,20"
echo "ZONE_VEHICLE_BINDING=false"
echo "DAILY_WHOLE_ROUTE_ASSIGNMENT=true"
echo "EDITABLE_ROUTE_ASSIGNMENTS_RESET=true"
echo "PROTECTED_DAYS_PRESERVED=true"
echo "ALL_ROUTES_VALID=true"
echo "INTERNAL_HEALTH=$INTERNAL"
echo "PUBLIC_HEALTH=$PUBLIC"
echo "DEPLOYMENT=ok"
