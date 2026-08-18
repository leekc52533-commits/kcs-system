#!/usr/bin/env bash
set -Eeuo pipefail
# Copy-safe invocation (one line):
# sudo env KCS_DB_PATH=/opt/kcs-app/data/kcs.sqlite KCS_TARGET_COMMIT=<exact-40-hex> KCS_ROLLBACK_COMMIT=<exact-known-good-40-hex> KCS_HTTPS_HEALTH=https://dispatch.example.com/api/health bash /opt/kcs-app/scripts/deploy-v42.sh
: "${KCS_DB_PATH:?KCS_DB_PATH must be an explicit absolute path}"
: "${KCS_TARGET_COMMIT:?KCS_TARGET_COMMIT is required}"
: "${KCS_ROLLBACK_COMMIT:?KCS_ROLLBACK_COMMIT is required}"
KCS_APP_DIR="${KCS_APP_DIR:-/opt/kcs-app}"; KCS_SERVICE="${KCS_SERVICE:-kcs-api}"; KCS_INTERNAL_HEALTH="${KCS_INTERNAL_HEALTH:-http://127.0.0.1:8787/api/health}"
: "${KCS_HTTPS_HEALTH:?KCS_HTTPS_HEALTH is required and must end in /api/health}"
[[ "$KCS_DB_PATH" = /* && "$KCS_APP_DIR" = /* && "$KCS_HTTPS_HEALTH" == */api/health && "$KCS_INTERNAL_HEALTH" == */api/health ]] || { echo 'Database/app paths must be absolute and health URLs must use /api/health' >&2; exit 2; }
[[ "$KCS_DB_PATH$KCS_APP_DIR" != *"'"* ]] || { echo "Paths containing apostrophes are unsupported" >&2; exit 2; }
cd "$KCS_APP_DIR"
[[ "$(git rev-parse HEAD)" == "$KCS_TARGET_COMMIT" ]] || { echo 'HEAD is not the exact reviewed target commit' >&2; exit 2; }
git diff-index --quiet HEAD -- && [[ -z "$(git status --porcelain --untracked-files=normal)" ]] || { echo 'Worktree is not clean' >&2; exit 2; }
[[ "$KCS_ROLLBACK_COMMIT" =~ ^[0-9a-f]{40}$ && "$KCS_ROLLBACK_COMMIT" != "$KCS_TARGET_COMMIT" ]] && git cat-file -e "$KCS_ROLLBACK_COMMIT^{commit}" 2>/dev/null || { echo 'KCS_ROLLBACK_COMMIT must be an existing exact commit distinct from KCS_TARGET_COMMIT' >&2; exit 2; }
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"; SAFE_DIR="${KCS_BACKUP_DIR:-$KCS_APP_DIR/data/backups/v42-$STAMP}"; SNAPSHOT="$SAFE_DIR/before-v42.json"; IMPACT="$SAFE_DIR/v42-impact.json"; BACKUP="$SAFE_DIR/kcs-v41.sqlite"
if [[ -e "$SAFE_DIR" ]];then mode=$(stat -c '%a' "$SAFE_DIR");[[ -d "$SAFE_DIR" && $((8#$mode & 077)) -eq 0 ]] || { echo 'Existing backup directory must already be private (0700 or stricter)' >&2;exit 2; };else install -d -m 0700 "$SAFE_DIR";fi
impact_args=(--output "$IMPACT");[[ -n "${KCS_V42_REVIEW_OVERRIDE_FILE:-}" ]]&&impact_args+=(--review-override "$KCS_V42_REVIEW_OVERRIDE_FILE")
KCS_DB_PATH="$KCS_DB_PATH" node scripts/v42-impact-report.mjs "${impact_args[@]}"
DEPLOYMENT_STARTED=0; SERVICE_STOPPED=0; MIGRATED=0
rollback(){ code=$?; if ((code==0));then return;fi; if ((DEPLOYMENT_STARTED==0));then exit "$code";fi; set +e; if ((SERVICE_STOPPED==0));then systemctl stop "$KCS_SERVICE";fi; git checkout --detach "$KCS_ROLLBACK_COMMIT"; if ((MIGRATED==1))&&[[ -f "$BACKUP" ]];then cp --preserve=mode,timestamps "$BACKUP" "$KCS_DB_PATH";fi; systemctl start "$KCS_SERVICE"; echo "Deployment failed; restored explicit known-good commit and v41 backup" >&2; exit "$code"; }
trap rollback EXIT
KCS_DB_PATH="$KCS_DB_PATH" node scripts/cloud-preflight.mjs --mode before --snapshot "$SNAPSHOT"
DEPLOYMENT_STARTED=1
systemctl stop "$KCS_SERVICE"; SERVICE_STOPPED=1
sqlite3 "$KCS_DB_PATH" ".backup '$BACKUP'"; chmod 0600 "$BACKUP"; [[ "$(sqlite3 "$BACKUP" 'PRAGMA integrity_check;')" == 'ok' ]] || { echo 'Backup integrity check failed' >&2; exit 1; }
KCS_DB_PATH="$KCS_DB_PATH" node scripts/migrate-v42.mjs; MIGRATED=1
npm ci; npm run build; [[ -f dist/index.html ]] || { echo 'Production build did not create dist/index.html' >&2; exit 1; }
systemctl start "$KCS_SERVICE"; SERVICE_STOPPED=0
HEALTH_TIMEOUT_SECONDS="${KCS_HEALTH_TIMEOUT_SECONDS:-60}"; HEALTH_RETRY_DELAY_SECONDS="${KCS_HEALTH_RETRY_DELAY_SECONDS:-2}"
[[ "$HEALTH_TIMEOUT_SECONDS" =~ ^[1-9][0-9]*$ && "$HEALTH_RETRY_DELAY_SECONDS" =~ ^[0-9]+$ ]] || { echo 'Health timeout must be positive and retry delay must be non-negative' >&2; exit 2; }
HEALTH_DEADLINE=$((SECONDS+HEALTH_TIMEOUT_SECONDS))
wait_for_health(){ local label="$1" url="$2"; while true;do if curl --fail --silent --show-error --connect-timeout 3 --max-time 5 "$url" >/dev/null;then return 0;fi; if ((SECONDS>=HEALTH_DEADLINE));then echo "$label health check did not become ready within the ${HEALTH_TIMEOUT_SECONDS}s deployment readiness window" >&2;return 1;fi;sleep "$HEALTH_RETRY_DELAY_SECONDS";done; }
wait_for_health Internal "$KCS_INTERNAL_HEALTH"
wait_for_health Public "$KCS_HTTPS_HEALTH"
KCS_DB_PATH="$KCS_DB_PATH" node scripts/cloud-preflight.mjs --mode after --snapshot "$SNAPSHOT"
trap - EXIT
echo "Schema v42 deployment verified at the reviewed target; private backup retained"
