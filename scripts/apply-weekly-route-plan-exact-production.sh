#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
APPLY=/tmp/kcs-route-exact-apply.json
NOOP=/tmp/kcs-route-exact-noop.json
REFRESH=/tmp/kcs-route-arrange-refresh.json
VERIFY=/tmp/kcs-route-arrange-verify.json
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
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.after.matchesExact===true&&r.after.routeCount===665&&r.after.currentHash===r.after.expectedHash&&r.entryCount===665&&r.branchCount===317&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$APPLY"

env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-exact.mjs" --apply >"$NOOP"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.noOp===true&&r.before.matchesExact===true&&r.after.matchesExact===true&&r.after.routeCount===665&&r.after.currentHash===r.after.expectedHash&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$NOOP"

ROUTES="$(sqlite3 "$DB" 'SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1;')"
test "$ROUTES" = "665"
QM630S="$(sqlite3 "$DB" "SELECT GROUP_CONCAT(n,',') FROM (SELECT d.weekday,COUNT(s.branch_id) n FROM (SELECT 0 weekday UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6) d LEFT JOIN weekly_route_plan_stops s ON s.weekday=d.weekday AND s.vehicle_registration_number='QM630S' AND s.plan_id=(SELECT id FROM weekly_route_plans WHERE is_active=1) GROUP BY d.weekday ORDER BY d.weekday);")"
test "$QM630S" = "8,19,22,29,16,19,20"
QM630S_MON="$(sqlite3 "$DB" "SELECT GROUP_CONCAT(branch_code,'|') FROM (SELECT UPPER(CASE WHEN b.jodoo_branch_id GLOB '[0-9]*' THEN 'B'||b.jodoo_branch_id ELSE b.jodoo_branch_id END) branch_code FROM weekly_route_plan_stops s JOIN branches b ON b.id=s.branch_id WHERE s.plan_id=(SELECT id FROM weekly_route_plans WHERE is_active=1) AND s.weekday=1 AND s.vehicle_registration_number='QM630S' ORDER BY s.stop_sequence);")"
test "$QM630S_MON" = "B10419|B10418|B10133|B10108|B10059|B10207|B10071|B10137|B10058|B10107|B10128|B10140|B10149|B10147|B10150|B10148|B10113|B10074|B10170"

env KCS_DB_PATH="$DB" ROUTE_REFRESH_START="${ROUTE_REFRESH_START:-2026-09-07}" node "$APP/scripts/refresh-weekly-route-arrange.mjs" >"$REFRESH"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const monday=r.days[0];if(!(r.startDate==="2026-09-07"&&r.protectedDays.length===0&&monday&&monday.vehicles.QM630S===19))process.exit(1)' "$REFRESH"
LIVE_QM630S_MON="$(sqlite3 "$DB" "SELECT GROUP_CONCAT(branch_code,'|') FROM (SELECT UPPER(CASE WHEN b.jodoo_branch_id GLOB '[0-9]*' THEN 'B'||b.jodoo_branch_id ELSE b.jodoo_branch_id END) branch_code FROM dispatch_days dd JOIN dispatch_trips dt ON dt.dispatch_day_id=dd.id JOIN dispatches d ON d.id=dt.dispatch_id JOIN vehicles v ON v.id=d.vehicle_id JOIN dispatch_stops ds ON ds.dispatch_trip_id=dt.id JOIN branches b ON b.id=ds.branch_id WHERE dd.dispatch_date='2026-09-07' AND UPPER(REPLACE(v.registration_number,' ',''))='QM630S' AND ds.status<>'cancelled' ORDER BY dt.trip_number,ds.stop_sequence);")"
test "$LIVE_QM630S_MON" = "$QM630S_MON"
env KCS_DB_PATH="$DB" ROUTE_REFRESH_START="${ROUTE_REFRESH_START:-2026-09-07}" node "$APP/scripts/verify-weekly-route-arrange.mjs" >"$VERIFY"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const c=r.templateCountsSunToSat;if(!(r.sourceName==="KCS_7Day_5Vehicle_Route_Plan(2).xlsx [vehicle sheets Arrange]"&&r.allVehiclesMatch===true&&c.QAA4293N.join(",")==="1,15,19,17,20,18,13"&&c.QAB1225B.join(",")==="0,27,27,24,26,29,25"&&c.QM3028M.join(",")==="4,23,21,22,21,22,24"&&c.QM630S.join(",")==="8,19,22,29,16,19,20"&&c.QTY5028.join(",")==="12,24,23,19,19,19,18"))process.exit(1)' "$VERIFY"
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
echo "QM630S_MONDAY=$QM630S_MON"
echo "LIVE_2026_09_07_QM630S=$LIVE_QM630S_MON"
echo "QAA4293N_SUN_TO_SAT=1,15,19,17,20,18,13"
echo "QAB1225B_SUN_TO_SAT=0,27,27,24,26,29,25"
echo "QM3028M_SUN_TO_SAT=4,23,21,22,21,22,24"
echo "QTY5028_SUN_TO_SAT=12,24,23,19,19,19,18"
echo "ALL_VEHICLES_EXCEL_ORDER=true"
echo "DAILY_DRAFT_REFRESH=ok"
echo "INTEGRITY=ok"
echo "FOREIGN_KEY_ERRORS=0"
echo "INTERNAL_HEALTH=$INTERNAL"
echo "PUBLIC_HEALTH=$PUBLIC"
echo "DEPLOYMENT=ok"
