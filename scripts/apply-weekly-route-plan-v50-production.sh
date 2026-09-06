#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
EXPECTED_COMMIT="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
APPLY=/tmp/kcs-route-v50-final-apply.json
NOOP=/tmp/kcs-route-v50-final-noop.json

install -d -m 750 /var/lib/kcs/data/backups
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$EXPECTED_COMMIT"
SCHEMA="$(sqlite3 "$DB" "SELECT COALESCE(MAX(version),0) FROM schema_meta;")"
test "$SCHEMA" = "50"
BEFORE="$(sqlite3 "$DB" "SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1;")"
test "$BEFORE" = "691"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-route-v50-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" "PRAGMA integrity_check;")" = "ok"
test "$(sqlite3 "$BACKUP" "SELECT COUNT(*) FROM pragma_foreign_key_check;")" = "0"
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d" " -f1)"

APPLIED=0
DATA_OK=0
systemctl stop kcs-api
cleanup() {
  STATUS=$?
  trap - EXIT
  if [ "$STATUS" -ne 0 ] && [ "$APPLIED" = "1" ] && [ "$DATA_OK" = "0" ]; then
    sqlite3 "$DB" ".restore \"$BACKUP\"" || true
  fi
  systemctl start kcs-api || true
  exit "$STATUS"
}
trap cleanup EXIT

env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-v50.mjs" --apply >"$APPLY"
APPLIED=1
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.noOp===false&&r.changed===501&&r.inserted===7&&r.moved===9&&r.routeCount===698&&r.integrity==="ok"&&r.foreignKeyErrors===0&&r.report.conflicts.length===23&&r.report.extras.length===0))process.exit(1)' "$APPLY"

ROUTES="$(sqlite3 "$DB" "SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1;")"
test "$ROUTES" = "698"
ADDED="$(sqlite3 "$DB" "SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id JOIN branches b ON b.id=s.branch_id WHERE p.is_active=1 AND ((s.weekday=0 AND UPPER(REPLACE(b.jodoo_branch_id,' ','')) IN ('10204','B10204') AND s.vehicle_registration_number='QAA4293N') OR (s.weekday IN (2,5) AND UPPER(REPLACE(b.jodoo_branch_id,' ','')) IN ('10137','B10137') AND s.vehicle_registration_number='QM630S') OR (s.weekday IN (2,5) AND UPPER(REPLACE(b.jodoo_branch_id,' ',''))='B10498' AND s.vehicle_registration_number='QAB1225B') OR (s.weekday IN (2,5) AND UPPER(REPLACE(b.jodoo_branch_id,' ',''))='B10499' AND s.vehicle_registration_number='QAB1225B'));")"
test "$ADDED" = "7"
STANDBY="$(sqlite3 "$DB" "SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id WHERE p.is_active=1 AND s.vehicle_registration_number='QAV3468';")"
test "$STANDBY" = "0"
OTW="$(sqlite3 "$DB" "SELECT COUNT(*) FROM weekly_route_plan_stops s JOIN weekly_route_plans p ON p.id=s.plan_id JOIN branches b ON b.id=s.branch_id WHERE p.is_active=1 AND UPPER(REPLACE(b.jodoo_branch_id,' ','')) IN ('B10075','B10118','B10092','B10093','B10457','B10480');")"
test "$OTW" = "0"

env KCS_DB_PATH="$DB" node "$APP/scripts/apply-weekly-route-plan-v50.mjs" --apply >"$NOOP"
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));if(!(r.mode==="apply"&&r.noOp===true&&r.changed===0&&r.inserted===0&&r.moved===0&&r.routeCount===698&&r.integrity==="ok"&&r.foreignKeyErrors===0))process.exit(1)' "$NOOP"
test "$(sqlite3 "$DB" "PRAGMA integrity_check;")" = "ok"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM pragma_foreign_key_check;")" = "0"

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
echo "APPLY=ok changed=501 inserted=7 moved=9"
echo "SECOND_APPLY=no-op"
echo "ROUTE_COUNT=$ROUTES"
echo "APPROVED_ADDITIONS=$ADDED"
echo "STANDBY_ROUTES=$STANDBY"
echo "OTW_ROUTES=$OTW"
echo "INTEGRITY=ok"
echo "FOREIGN_KEY_ERRORS=0"
echo "INTERNAL_HEALTH=$INTERNAL"
echo "PUBLIC_HEALTH=$PUBLIC"
echo "DEPLOYMENT=ok"
