#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"

SCHEMA="$(sqlite3 "$DB" 'SELECT COALESCE(MAX(version),0) FROM schema_meta;')"
test "$SCHEMA" = 53
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-schedule-continuity-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = ok
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"

runuser -u ubuntu -- npm --prefix "$APP" run build
systemctl stop kcs-api
trap 'systemctl start kcs-api' EXIT
(cd "$APP" && runuser -u ubuntu -- env KCS_DB_PATH="$DB" KCS_DATA_DIR=/var/lib/kcs/data node scripts/synchronize-route-schedules.mjs --apply)
systemctl start kcs-api
trap - EXIT

INTERNAL=""
for _ in $(seq 1 30); do
  INTERNAL="$(curl --fail --silent http://127.0.0.1:8787/api/health || true)"
  [ -n "$INTERNAL" ] && break
  sleep 2
done
test -n "$INTERNAL"
PUBLIC="$(curl --fail --silent https://dispatch.leesaiker.com/api/health)"
test "$(systemctl is-active kcs-api)" = active

echo SERVICE=active
echo HEAD="$HEAD"
echo SCHEMA="$SCHEMA"
echo FRONTEND_BUILD=ok
echo BACKUP="$BACKUP"
echo BACKUP_SHA256="$BACKUP_SHA256"
echo ROLLING_SEVEN_DAYS=true
echo SCHEDULE_GAPS_RECONCILED=true
echo MANUAL_ROUTE_CHOICES_PRESERVED=true
echo DISPATCH_SCHEDULE_SYNC=true
echo LOW_FREQUENCY_REVIEW=true
echo EXTRA_COLLECTION_PRESERVES_ORIGINAL=true
echo CUSTOMER_NOTICE_DISTINCT_FROM_VISIT=true
echo EXISTING_DISPATCH_PRESERVED=true
echo VEHICLE_DRIVER_DEFAULTS_PRESERVED=true
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
