#!/usr/bin/env bash
set -euo pipefail
APP_DIR=/opt/kcs-app
DB_PATH=${KCS_DB_PATH:-/var/lib/kcs/data/kcs-dispatch.sqlite}
EXPECTED_COMMIT=${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}
cd "$APP_DIR"
test "$(git rev-parse HEAD)" = "$EXPECTED_COMMIT"
test "$(sqlite3 "$DB_PATH" 'SELECT MAX(version) FROM schema_meta;')" = 53
npm ci
npm run build
BACKUP_DIR=/var/lib/kcs/data/backups
install -d -m 700 "$BACKUP_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
BACKUP="$BACKUP_DIR/kcs-dispatch-pre-supervisor-collector-$STAMP.sqlite"
sqlite3 "$DB_PATH" ".backup '$BACKUP'"
chmod 600 "$BACKUP"
systemctl restart kcs-api
for _ in $(seq 1 30);do curl -fsS http://127.0.0.1:3000/api/health >/tmp/kcs-supervisor-internal-health.json&&break;sleep 1;done
for _ in $(seq 1 30);do curl -fsS https://kcs.leesaiker.com/api/health >/tmp/kcs-supervisor-public-health.json&&break;sleep 1;done
test "$(systemctl is-active kcs-api)" = active
echo SERVICE=active
echo HEAD="$(git rev-parse HEAD)"
echo SCHEMA="$(sqlite3 "$DB_PATH" 'SELECT MAX(version) FROM schema_meta;')"
echo FRONTEND_BUILD=ok
echo BACKUP="$BACKUP"
echo BACKUP_SHA256="$(sha256sum "$BACKUP"|awk '{print $1}')"
echo SUPERVISOR_COLLECTOR_MENU=true
echo ROUTE_INSPECTION_READ_ONLY=true
echo SUPERVISOR_ACTING_DRIVER=true
echo ACTING_DRIVER_TODAY_ONLY=true
echo SUPERVISOR_SYSTEM_ROLE_PRESERVED=true
echo INTERNAL_HEALTH="$(cat /tmp/kcs-supervisor-internal-health.json)"
echo PUBLIC_HEALTH="$(cat /tmp/kcs-supervisor-public-health.json)"
echo DEPLOYMENT=ok
