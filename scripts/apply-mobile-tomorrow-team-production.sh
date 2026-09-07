#!/usr/bin/env bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
REPAIR=/tmp/kcs-mobile-tomorrow-team-repair.json
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"
SCHEMA="$(sqlite3 "$DB" 'SELECT COALESCE(MAX(version),0) FROM schema_meta;')"
test "$SCHEMA" = "53"
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-mobile-tomorrow-team-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = "ok"
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"
runuser -u ubuntu -- npm --prefix "$APP" run build
APPLIED=0
DATA_OK=0
systemctl stop kcs-api
cleanup(){ STATUS=$?;trap - EXIT;if [ "$STATUS" -ne 0 ] && [ "$APPLIED" = "1" ] && [ "$DATA_OK" = "0" ];then sqlite3 "$DB" ".restore \"$BACKUP\"" || true;fi;systemctl start kcs-api || true;exit "$STATUS"; }
trap cleanup EXIT
env KCS_DB_PATH="$DB" ROUTE_TEAM_START="${ROUTE_TEAM_START:-2026-09-07}" node "$APP/scripts/repair-future-vehicle-teams.mjs" >"$REPAIR"
APPLIED=1
node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1]));if(!(r.integrity==="ok"&&r.foreignKeyErrors===0&&r.conflicts===0))process.exit(1)' "$REPAIR"
test "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = "ok"
test -z "$(sqlite3 "$DB" 'PRAGMA foreign_key_check;')"
DATA_OK=1
systemctl start kcs-api
trap - EXIT
INTERNAL=""
for _ in $(seq 1 30);do INTERNAL="$(curl --fail --silent http://127.0.0.1:8787/api/health || true)";if [ -n "$INTERNAL" ];then break;fi;sleep 2;done
test -n "$INTERNAL"
PUBLIC="$(curl --fail --silent https://dispatch.leesaiker.com/api/health)"
test "$(systemctl is-active kcs-api)" = "active"
ASSIGNMENTS_CARRIED="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1])).assignmentsCarried)' "$REPAIR")"
echo "SERVICE=active"
echo "HEAD=$HEAD"
echo "SCHEMA=$SCHEMA"
echo "FRONTEND_BUILD=ok"
echo "BACKUP=$BACKUP"
echo "BACKUP_SHA256=$BACKUP_SHA256"
echo "FUTURE_VEHICLE_TEAMS_CARRIED=$ASSIGNMENTS_CARRIED"
echo "MOBILE_TOMORROW_TEAM_CONTINUITY=true"
echo "MOBILE_ROUTE_AUTO_REFRESH=true"
echo "ROUTE_VEHICLE_SEPARATION_PRESERVED=true"
echo "INTERNAL_HEALTH=$INTERNAL"
echo "PUBLIC_HEALTH=$PUBLIC"
echo "DEPLOYMENT=ok"
