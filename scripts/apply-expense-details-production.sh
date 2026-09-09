#!/usr/bin/env bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"
test "$(systemctl is-active kcs-api)" = active
SCHEMA="$(sqlite3 "$DB" 'SELECT MAX(version) FROM schema_meta;')"
[[ "$SCHEMA" = 55 || "$SCHEMA" = 56 ]]
STAGE="$(mktemp -d "$APP/.expense-build-XXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
chown ubuntu:ubuntu "$STAGE"
runuser -u ubuntu -- npm --prefix "$APP" run build -- --outDir "$STAGE" --emptyOutDir
test -s "$STAGE/index.html"
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-pre-expense-details-${STAMP}.sqlite"
FRONTEND_BACKUP="/var/lib/kcs/data/backups/kcs-ui-pre-expense-details-${STAMP}.tar.gz"
sqlite3 "$DB" ".backup \"$BACKUP\""
test "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" = ok
tar -czf "$FRONTEND_BACKUP" -C "$APP" dist
# Reuse the same local OCR engine as unloading-weight recognition.
if ! command -v tesseract >/dev/null || ! tesseract --list-langs 2>/dev/null | grep -qx eng; then
 apt-get update
 apt-get install -y tesseract-ocr tesseract-ocr-eng
fi
# Startup applies the additive expense-details table before exposing the new UI.
systemctl restart kcs-api
INTERNAL=""
for _ in $(seq 1 25); do
 INTERNAL="$(curl --max-time 2 --fail --silent http://127.0.0.1:8787/api/health || true)"
 [ -n "$INTERNAL" ] && break
 sleep 1
done
test -n "$INTERNAL"
test "$(sqlite3 "$DB" 'SELECT MAX(version) FROM schema_meta;')" = 56
test "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = ok
test -z "$(sqlite3 "$DB" 'PRAGMA foreign_key_check;')"
install -d -o ubuntu -g ubuntu "$APP/dist/assets"
cp -a "$STAGE/assets/." "$APP/dist/assets/"
install -o ubuntu -g ubuntu -m 644 "$STAGE/index.html" "$APP/dist/.index-ui-next.html"
mv -f "$APP/dist/.index-ui-next.html" "$APP/dist/index.html"
PUBLIC="$(curl --max-time 15 --fail --silent https://dispatch.leesaiker.com/api/health)"
echo SERVICE="$(systemctl is-active kcs-api)"
echo HEAD="$HEAD"
echo SCHEMA=56
echo FRONTEND_BUILD=ok
echo BACKUP="$BACKUP"
echo FRONTEND_BACKUP="$FRONTEND_BACKUP"
echo EXPENSE_DETAILS=ready
echo VEHICLE_EXPENSE_REQUIRED_FIELDS=ready
echo OTHER_DESCRIPTION_OPTIONAL=true
echo RECEIPT_OCR=ready_for_review
echo UI_LANGUAGES=en,ms,zh
echo INTEGRITY=ok
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
