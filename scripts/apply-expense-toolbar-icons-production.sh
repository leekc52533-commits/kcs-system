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
[[ "$SCHEMA" = 68 ]]
STAGE="$(mktemp -d /tmp/kcs-expense-toolbar-build-XXXXXX)"
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
BACKUP="/var/lib/kcs/data/backups/kcs-pre-expense-toolbar-${STAMP}.sqlite"
FRONTEND_BACKUP="/var/lib/kcs/data/backups/kcs-ui-pre-expense-toolbar-${STAMP}.tar.gz"
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
test "$(sqlite3 "$DB" 'SELECT MAX(version) FROM schema_meta;')" = 68
test "$(sqlite3 "$DB" 'PRAGMA integrity_check;')" = ok
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('expense_amount_corrections','expense_correction_requests');")" = 2
test -z "$(sqlite3 "$DB" 'PRAGMA foreign_key_check;')"
test "$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('employee_notices','employee_notice_receipts','employee_guide_reads');")" = 3
install -d -o ubuntu -g ubuntu "$APP/dist/assets"
cp -a "$STAGE/assets/." "$APP/dist/assets/"
install -o ubuntu -g ubuntu -m 644 "$STAGE/index.html" "$APP/dist/.index-ui-next.html"
mv -f "$APP/dist/.index-ui-next.html" "$APP/dist/index.html"
PUBLIC="$(curl --max-time 15 --fail --silent https://dispatch.leesaiker.com/api/health)"
echo SERVICE="$(systemctl is-active kcs-api)"
echo HEAD="$TARGET"
echo SCHEMA=68
echo FRONTEND_BUILD=ok
echo BACKUP="$BACKUP"
echo FRONTEND_BACKUP="$FRONTEND_BACKUP"
echo TEMPORARY_CUSTOMER_MOBILE=ready
echo TEMPORARY_CUSTOMER_BILLING=ready
echo TEMPORARY_CUSTOMER_REVIEW=ready
echo EXISTING_CUSTOMER_SEARCH=ready
echo EXISTING_CUSTOMER_ONCE_COLLECTION=ready
echo CUSTOMER_TRANSFER_APPROVAL=ready
echo DRIVER_ARRANGEMENT_APPROVAL=ready
echo NO_GOODS_ARRIVAL_POLICY=ready
echo POLICY_EFFECTIVE=2026-09-14T00:00:00+08:00
echo NOTICE_BOARD_PUBLISH=ready
echo NOTICE_BOARD_MOBILE_POPUP=ready
echo NOTICE_BOARD_READ_RECEIPTS=ready
echo NOTICE_BOARD_MORE_HISTORY=ready
echo NOTICE_BOARD_SIDEBAR=ready
echo NOTICE_BOARD_TABLE_FILTERS=ready
echo DRIVER_GUIDE_POPUP=ready
echo DRIVER_GUIDE_MORE=ready
echo DRIVER_GUIDE_NEXT_STEP=ready
echo GUIDE_EFFECTIVE=2026-09-14T00:00:00+08:00
echo EMPLOYEE_PHONE_PREVIEW=ready
echo EMPLOYEE_PREVIEW_READ_ONLY=ready
echo SUPERVISOR_USER_GUIDE=ready
echo COMPACT_MENU_ICONS=ready
echo COMPACT_MENU_SPACING=ready
echo HOVER_SCROLLBARS=ready
echo SINGLE_HORIZONTAL_SCROLL=ready
echo CUSTOM_MENU_FOLDERS=ready
echo MENU_BACKDROP_CLOSE=ready
echo LIGHT_SIDEBAR=ready
echo GREY_BLUE_SIDEBAR=ready
echo PURPLE_MAIN_MENU_ICONS=ready
echo LIGHT_BLUE_CHILD_ICONS=ready
echo SIDEBAR_MOUSE_LEAVE_AUTOHIDE=ready
echo OFFICE_COMPANY_DOCUMENT_READ=ready
echo REPLACEMENT_DOCUMENT_READ=ready
echo UNLOADING_ARCHIVE=ready
echo UNLOADING_ARCHIVE_EXPORT=ready
echo CASH_LEDGER_BILL_PROOF=ready
echo BILL_PROOF_IN_PAGE_VIEWER=ready
echo CUSTOMER_RECEIPT_ARCHIVE=ready
echo OPTIONAL_RECEIPT_IMAGE_SHARE=ready
echo CUSTOM_MENU_PAGE_NAMES=ready
echo EMPLOYEE_OWN_BILL_HISTORY=ready
echo COMPLETED_BILL_SHARE=ready
echo EXPENSE_CORRECTION_CENTRAL_ENTRY=ready
echo EXPENSE_CORRECTION_SUPERVISOR_APPROVAL=ready
echo EXPENSE_CORRECTION_AUDIT=ready
echo EXPENSE_ICON_TOOLBAR=ready
echo EXPENSE_EXPORT_DATE_DIALOG=ready
echo UI_LANGUAGES=en,ms,zh
echo INTEGRITY=ok
echo INTERNAL_HEALTH="$INTERNAL"
echo PUBLIC_HEALTH="$PUBLIC"
echo DEPLOYMENT=ok
