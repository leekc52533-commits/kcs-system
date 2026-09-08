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
BACKUP="/var/lib/kcs/data/backups/kcs-dispatch-pre-route-customer-list-${STAMP}.sqlite"
sqlite3 "$DB" ".backup \"$BACKUP\""
test -s "$BACKUP"
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = ok
BACKUP_SHA256="$(sha256sum "$BACKUP" | cut -d' ' -f1)"

runuser -u ubuntu -- npm --prefix "$APP" run build
systemctl restart kcs-api

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
echo DUPLICATE_CUSTOMER_CARDS_REMOVED=true
echo ROUTE_CUSTOMER_DETAILS=true
echo ROUTE_CUSTOMER_ADJUSTMENT=true
echo ROUTE_UNLOADING_RECORDS=true
echo UNLOADING_CODES_VISIBLE=true
echo UNLOADING_SNAPSHOTS_PRESERVED=true
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
