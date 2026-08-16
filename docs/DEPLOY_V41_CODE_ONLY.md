# Schema v41 code-only 正式部署 Runbook

本流程只适用于 **schema v41 → schema v41 的 code-only deployment**。它不执行 migration、不导入资料，也不以副本覆盖正式库。任何 migration deployment 都必须使用独立、明确的 `--from` / `--to` 专用命令，完成 verified backup rehearsal，并取得人工确认。

## 固定正式环境与发布输入

| 项目 | 固定值 |
|---|---|
| App / systemd WorkingDirectory | `/opt/kcs-app` |
| Database | `/var/lib/kcs/data/kcs-dispatch.db` |
| Backup root | `/var/lib/kcs/backups` |
| systemd unit | `kcs-api` |
| Caddy root | `/opt/kcs-app/dist` |
| Domain | `https://dispatch.leesaiker.com` |

以下命令由维护者 `ubuntu` 执行，不要先切换为 root。特权操作显式使用 `sudo`；所有 Git/npm/Node 操作均使用 systemd 配置的 `KCS_USER`，避免产生 root-owned repository、`node_modules` 或 `dist`。

```bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
BACKUP_ROOT=/var/lib/kcs/backups
SERVICE=kcs-api
DOMAIN=https://dispatch.leesaiker.com
TARGET_COMMIT='<EXACT-40-CHAR-COMMIT-SHA>'

WORKING_DIRECTORY="$(sudo systemctl show -p WorkingDirectory --value "$SERVICE")"
KCS_USER="$(sudo systemctl show -p User --value "$SERVICE")"
KCS_GROUP="$(sudo systemctl show -p Group --value "$SERVICE")"
test "$WORKING_DIRECTORY" = "$APP"
test -n "$KCS_USER"
KCS_GROUP="${KCS_GROUP:-$(id -gn "$KCS_USER")}"
test "${#TARGET_COMMIT}" -eq 40
printf '%s' "$TARGET_COMMIT" | grep -Eq '^[0-9a-f]{40}$'
```

## 1. Fetch、验证 exact commit 与干净工作树

这些操作在服务停止前完成，并以 `KCS_USER` 执行：

```bash
sudo -u "$KCS_USER" -H git -C "$APP" fetch --prune origin
sudo -u "$KCS_USER" -H git -C "$APP" cat-file -e "$TARGET_COMMIT^{commit}"
test -z "$(sudo -u "$KCS_USER" -H git -C "$APP" status --porcelain)"
```

## 2. 停止服务并使用当前已部署版本备份

此时仍未 checkout 目标 commit，所以 `predeploy:kcs` 来自当前已部署版本（基准 `9b685cde` 可执行）。它保留 WAL checkpoint、source/backup integrity verification 和 verified `VACUUM INTO` backup。

```bash
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/v41-code-$STAMP"
SNAPSHOT="$BACKUP_DIR/before-v41.json"
sudo install -d -m 0700 -o "$KCS_USER" -g "$KCS_GROUP" "$BACKUP_DIR"
sudo systemctl stop "$SERVICE"
! sudo systemctl is-active --quiet "$SERVICE"
sudo -u "$KCS_USER" -H env KCS_DB_PATH="$DB" KCS_BACKUP_DIR="$BACKUP_DIR" npm --prefix "$APP" run predeploy:kcs
```

## 3. Checkout exact target 后建立 before snapshot

只有现在才 checkout 目标代码，并确认 detached HEAD。checkout 本身不改变数据库；before snapshot 的定义是目标应用尚未启动、数据库尚未被目标应用修改。

```bash
sudo -u "$KCS_USER" -H git -C "$APP" checkout --detach "$TARGET_COMMIT"
test "$(sudo -u "$KCS_USER" -H git -C "$APP" rev-parse HEAD)" = "$TARGET_COMMIT"
test -z "$(sudo -u "$KCS_USER" -H git -C "$APP" status --porcelain)"
sudo -u "$KCS_USER" -H env KCS_DB_PATH="$DB" npm --prefix "$APP" run deploy:v41:check -- --mode before --snapshot "$SNAPSHOT"
```

Before 必须报告 schema `41`、integrity `ok`、关键数量，以及 Employee、Auth Account 与密码 hash 的 SHA-256 fingerprint sentinel。数据库以 SQLite read-only 模式打开；snapshot 为 `0600` JSON，不包含密码 hash 明文。

## 4. 安装、检查与 build（明确不迁移）

```bash
sudo -u "$KCS_USER" -H npm --prefix "$APP" ci
sudo -u "$KCS_USER" -H npm --prefix "$APP" run lint
sudo -u "$KCS_USER" -H npm --prefix "$APP" run build
sudo -u "$KCS_USER" -H test -f /opt/kcs-app/dist/index.html
```

**停止：不要运行 `migrate:kcs`、`migrate:v16-to-v17`、任何 `migrate:v*` 或 production migration。** Caddy root 保持 `/opt/kcs-app/dist`。

## 5. 启动、health 与 postflight

```bash
sudo systemctl start "$SERVICE"
sudo systemctl is-active --quiet "$SERVICE"
sudo systemctl --no-pager --full status "$SERVICE"
curl --fail --silent --show-error http://127.0.0.1:8787/api/health
curl --fail --silent --show-error "$DOMAIN/api/health"
curl --fail --silent --show-error --head "$DOMAIN/"
sudo -u "$KCS_USER" -H sqlite3 -readonly "$DB" 'SELECT MAX(version) FROM schema_meta; PRAGMA integrity_check;'
sudo -u "$KCS_USER" -H env KCS_DB_PATH="$DB" npm --prefix "$APP" run deploy:v41:check -- --mode after --snapshot "$SNAPSHOT"
```

After 必须再次为 schema `41`、integrity `ok`。脚本拒绝关键数量下降、Employee/Account sentinel 改变、账号缺失或密码 fingerprint 改变。保留 exact HEAD、systemd/health 输出、before/after 结果与备份路径，交由人工签核。

## 回滚界线

代码问题优先停止服务并 checkout 已核准的前一 exact commit，再重新 build/start/check。只有经人工判断必须恢复数据库时，才使用 `rollback:kcs -- --backup <verified-backup> --confirm`；现有恢复机制会建立 rollback safety backup，并在 WAL/SHM 非空时拒绝恢复。code-only 发布不应改变数据库，不得把数据库恢复当作一般代码回滚步骤。
