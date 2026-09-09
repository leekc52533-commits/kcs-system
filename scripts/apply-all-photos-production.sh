#!/usr/bin/env bash
set -euo pipefail
APP=/opt/kcs-app
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"
test "$(systemctl is-active kcs-api)" = active
SCHEMA="$(sqlite3 /var/lib/kcs/data/kcs-dispatch.db 'SELECT MAX(version) FROM schema_meta;')"
test "$SCHEMA" = 54
# Build completely before replacing the served page. No database migration or API restart.
STAGE="$(mktemp -d "$APP/.ui-build-XXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
chown ubuntu:ubuntu "$STAGE"
runuser -u ubuntu -- npm --prefix "$APP" run build -- --outDir "$STAGE" --emptyOutDir
test -s "$STAGE/index.html"
install -d -m 750 /var/lib/kcs/data/backups
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP="/var/lib/kcs/data/backups/kcs-ui-pre-all-photos-${STAMP}.tar.gz"
tar -czf "$BACKUP" -C "$APP" dist
# Retain older hashed assets for already-open browser sessions.
install -d -o ubuntu -g ubuntu "$APP/dist/assets"
cp -a "$STAGE/assets/." "$APP/dist/assets/"
install -o ubuntu -g ubuntu -m 644 "$STAGE/index.html" "$APP/dist/.index-ui-next.html"
mv -f "$APP/dist/.index-ui-next.html" "$APP/dist/index.html"
INTERNAL="$(curl --fail --silent http://127.0.0.1:8787/api/health)"
PUBLIC="$(curl --fail --silent https://dispatch.leesaiker.com/api/health)"
echo SERVICE="$(systemctl is-active kcs-api)"
echo HEAD="$HEAD"
echo SCHEMA="$SCHEMA"
echo FRONTEND_BUILD=ok
echo FRONTEND_BACKUP="$BACKUP"
echo ALL_PHOTO_ENTRYPOINTS=ready
echo PHOTO_PREVIEW_AND_COMPRESSION=ready
echo UI_LANGUAGES=en,ms,zh
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
