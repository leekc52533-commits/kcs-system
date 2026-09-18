#!/usr/bin/env bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
PREVIOUS="${PREVIOUS_COMMIT:?PREVIOUS_COMMIT is required}"
[[ "$TARGET" =~ ^[a-f0-9]{40}$ && "$PREVIOUS" =~ ^[a-f0-9]{40}$ ]]
exec 9>/var/lock/kcs-deployment.lock
flock -n 9
test "$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)" = "$TARGET"
runuser -u ubuntu -- git -C "$APP" cat-file -e "$PREVIOUS^{commit}"
test -z "$(runuser -u ubuntu -- git -C "$APP" status --porcelain --untracked-files=no)"
test "$(systemctl is-active kcs-api)" = active
SCHEMA="$(sqlite3 "$DB" 'SELECT MAX(version) FROM schema_meta;')"
[[ "$SCHEMA" = 70 || "$SCHEMA" = 71 || "$SCHEMA" = 72 || "$SCHEMA" = 73 || "$SCHEMA" = 74 ]]
STAGE="$(mktemp -d /tmp/kcs-flexible-collection-build-XXXXXX)"
chown ubuntu:ubuntu "$STAGE"
RESTARTED=0
cleanup(){
 code=$?
 trap - EXIT
 if ((code!=0 && RESTARTED==1)); then
  set +e
  systemctl stop kcs-api
  runuser -u ubuntu -- git -C "$APP" checkout --detach "$PREVIOUS"
  if [[ -f "$FRONTEND_BACKUP" ]]; then tar -xzf "$FRONTEND_BACKUP" -C "$APP"; fi
  systemctl start kcs-api
  echo 'DEPLOYMENT=failed; previous code/frontend restored. Database retained, including any new records.' >&2
 fi
 rm -rf -- "$STAGE"
 exit "$code"
}
trap cleanup EXIT
runuser -u ubuntu -- npm --prefix "$APP" run build -- --outDir "$STAGE" --emptyOutDir
test -s "$STAGE/index.html"
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-pre-flexible-collection-${STAMP}.sqlite"
FRONTEND_BACKUP="/var/lib/kcs/data/backups/kcs-ui-pre-flexible-collection-${STAMP}.tar.gz"
RESTARTED=1
systemctl stop kcs-api
sqlite3 "$DB" ".backup \"$BACKUP\""
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = ok
tar -czf "$FRONTEND_BACKUP" -C "$APP" dist
RESTARTED=1
systemctl restart kcs-api
INTERNAL=''
for _ in $(seq 1 25); do
 INTERNAL="$(curl --max-time 2 --fail --silent http://127.0.0.1:8787/api/health || true)"
 [[ -n "$INTERNAL" ]] && break
 sleep 1
done
test -n "$INTERNAL"
test "$(sqlite3 "$DB" 'SELECT MAX(version) FROM schema_meta;')" = 74
test "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('expense_amount_corrections','expense_correction_requests');")" = 2
test -z "$(sqlite3 "$DB" 'PRAGMA foreign_key_check;')"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('employee_notices','employee_notice_receipts','employee_guide_reads');")" = 3
install -d -o ubuntu -g ubuntu "$APP/dist/assets"
cp -a "$STAGE/assets/." "$APP/dist/assets/"
install -o ubuntu -g ubuntu -m 644 "$STAGE/index.html" "$APP/dist/.index-ui-next.html"
mv -f "$APP/dist/.index-ui-next.html" "$APP/dist/index.html"
PUBLIC="$(curl --max-time 15 --fail --silent https://dispatch.leesaiker.com/api/health)"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('document_numbers','document_number_sequences');")" = 2
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('unloading_corrections','unloading_correction_requests');")" = 2
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('cargo_batches','cargo_batch_members','cargo_batch_unloads','cargo_batch_notifications');")" = 4
echo SERVICE="$(systemctl is-active kcs-api)"
echo HEAD="$TARGET"
echo SCHEMA=74
echo BACKUP="$BACKUP"
echo FRONTEND_BACKUP="$FRONTEND_BACKUP"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('earnings_rules','earnings_payments');")" = 2
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='income_notifications';")" = 1
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('zone_collection_access','zone_collection_access_events','flexible_collection_claims');")" = 3
echo FLEXIBLE_COLLECTION=ready
echo HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
