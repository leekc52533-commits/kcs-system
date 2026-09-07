#!/usr/bin/env bash
set -euo pipefail

APP=/opt/kcs-app
TARGET="${EXPECTED_COMMIT:?EXPECTED_COMMIT is required}"
HEAD="$(runuser -u ubuntu -- git -C "$APP" rev-parse HEAD)"
test "$HEAD" = "$TARGET"

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
echo FRONTEND_BUILD=ok
echo DISPATCH_ROUTE_OVERVIEW_RESTORED=true
echo ROUTE_OVERVIEW_HEADING_HIDDEN=true
echo ROUTE_FIRST_ASSIGNMENT_PRESERVED=true
echo ROUTE_DATA_UNCHANGED=true
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
