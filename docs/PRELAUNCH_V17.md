# KCS 上线前修正 v17

## 目的与代码变更

本批次统一古晋日期、增加账号级三语言、标准返回导航、正式 System Role 权限和密码可视化。没有重建 Customer、Branch、GPS、Dispatch、Vehicle、Employee 或 Auth 主档。

主要文件：

- `shared/kuchingTime.js`：Asia/Kuching 日期、加减日、快捷按钮判断和本地日期标签。
- `server/schema.mjs`、`server/database.mjs`：schema v17、可回滚兼容迁移、启动完整性检查。
- `server/authService.mjs`、`server/index.mjs`：System Role、账号语言、账号修改审计及服务端权限。
- `src/translations.js`、`src/i18n.jsx`：BM/中文/English 与 English fallback。
- `src/BackButton.jsx`、`src/navigation.js`：返回与未保存拦截。
- `src/PasswordInput.jsx`、`src/AccountManagementPage.jsx`：密码眼睛及账号管理。
- `scripts/predeploy.mjs`、`scripts/rollback.mjs`、`scripts/verify-data.mjs`：备份、恢复及资料核对。
- `scripts/cloud-preflight.mjs`：只读记录 AWS 正式库的 Employee、Auth Account 与 EMP0003，并在 migration 后按 ID 验证完整保留。
- `scripts/cloud-migration-rehearsal.mjs`：只在正式备份副本执行 v17 migration rehearsal，绝不连接写入正式数据库。

## 重要环境区别

开发电脑的 `data/kcs-dispatch.db` 是较旧的本机副本，不代表 AWS 正式数据库，也不得上传覆盖正式库。AWS 唯一正式数据库为：

```text
/var/lib/kcs/data/kcs-dispatch.db
```

已知 AWS 基线为 Customers 253、Branches 475、Employees 约 4（以 preflight 实查为准）、Vehicles 7、Zone Groups 9、Official GPS 118、Auth Accounts 2；并包含可登录账号 EMP0003 / `SUNDARAMUTI BIN MOHAMMAD`。任何本机数量差异都不能触发删除、同步回写或数据库替换。v17 只执行 schema migration。

## 使用方法

登录页可选 Bahasa Melayu、中文或 English，并立即切换登录界面。登录成功时，当前选择会写入个人账号 `preferred_language`，同一浏览器也保存最近选择。下次登录或恢复 Session 后使用该账号上次保存的语言。

Owner Admin 从左侧“账号管理”选择普通账号，可修改 Username/System Role；Operations Admin 只可建立、停用、启用、解锁和重设普通账号。Employee Code 在后台强制不可修改。

登录后的桌面和 Driver/Crew 手机顶栏不再有独立语言下拉框。右上角账号姓名打开 Account/Profile 菜单，菜单显示 Employee Name、Username、Employee Code、System Role 和可选择的 Preferred Language；选择 Bahasa Melayu、中文或 English 后立即切换并自动保存，不需要 Save。Owner/Operations 另外可进入 Account Management。`kcadmin` 无论旧兼容字段为何值，都按受保护的 `owner_admin` 解析，而 Employee Primary Job Role 保持独立。

用户主动选择 Change Password 时可以取消返回；成功后原 Session 继续有效，不会自动退出。只有首次临时密码或管理员重设密码后才设置 `must_change_password=true`。强制页面会说明原因、不能取消，但可退出账号。密码修改成功后清除 `must_change_password`，除非管理员再次重设密码，否则不会再次强制。

返回按钮优先返回实际上一页；没有 KCS 模块历史时回到 Dashboard。浏览器返回键使用同一模块历史。编辑 Employee 等有 dirty state 的页面，离开前需选择放弃或继续编辑。

## 权限与安全影响

| System Role | 主要允许 | 明确禁止 |
|---|---|---|
| owner_admin | 全部运营、普通账号身份、敏感授权 | 不能把普通账号提升为 owner_admin；kcadmin Owner 身份受保护 |
| operations_admin | 普通员工/车辆/排程/GPS、普通账号建立/停用/解锁/重设 | Owner、系统安全、服务器/部署/备份、敏感资料默认查看、权限授权 |
| supervisor | 日常桌面及 GPS 审核 | 账号身份与敏感授权 |
| office | 一般桌面工作 | 账号管理与敏感资料 |
| driver / crew | 当日手机路线及 GPS 采集 | 桌面管理 |

前端隐藏不构成授权；所有账号修改均在 API 再验证。Username 与 System Role 的旧值、新值、操作者、目标账号和时间写入 `auth_account_change_history`。密码、密码哈希和明文敏感资料不写入该审计。

## 数据库变更与兼容

v17 只为 `auth_accounts` 增加：

- `system_role`
- `preferred_language`

并增加 `auth_account_change_history`。旧 `role` 继续保留为兼容列，Owner/Operations 在旧列映射为 `admin`，因此旧关联与登录不改变。`kcadmin` 的新 System Role 为 `owner_admin`。migration 使用 `BEGIN IMMEDIATE`，失败会 rollback；启动完成后执行 `PRAGMA integrity_check`。

本次 Account/Profile 修正不提高 schema 版本，也不新增资料 migration；继续沿用 schema v17。

## Ubuntu / AWS 正式部署（本批次尚未执行）

以下命令只可在维护时段由正式服务器管理员执行。不要使用 `npm run dev`，不要复制本机 SQLite。假设现有 App、Database、systemd 和 Caddy 路径保持不变：

```bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
APP_USER="$(stat -c '%U' "$APP")"
KCS_USER="$(systemctl show -p User --value kcs-api)"
KCS_USER="${KCS_USER:-root}"
KCS_GROUP="$(id -gn "$KCS_USER")"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="/var/lib/kcs/backups/v17-$STAMP"
RAW_BACKUP="$BACKUP_DIR/kcs-dispatch-before-v17.sqlite"
SNAPSHOT="$BACKUP_DIR/preflight-v17.json"

sudo install -d -m 0700 -o "$KCS_USER" -g "$KCS_GROUP" "$BACKUP_DIR"
sudo systemctl stop kcs-api
sudo systemctl is-active kcs-api && exit 1 || true

# API停止后合并WAL，并在pull前先建立原始安全备份
sudo -u "$KCS_USER" sqlite3 "$DB" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;"
sudo -u "$KCS_USER" sqlite3 "$DB" ".backup '$RAW_BACKUP'"
sudo chmod 0600 "$RAW_BACKUP"
sudo -u "$KCS_USER" sqlite3 "$RAW_BACKUP" "PRAGMA integrity_check;"

# 只更新程序，不上传或替换DB
sudo -u "$APP_USER" -H git -C "$APP" pull --ff-only origin main
sudo -u "$APP_USER" -H npm --prefix "$APP" ci

# 对AWS正式库做只读preflight；必须看到EMP0003与2个账号
sudo -u "$KCS_USER" env KCS_DB_PATH="$DB" \
  node "$APP/scripts/cloud-preflight.mjs" --mode before --snapshot "$SNAPSHOT"

# 再建立应用级校验备份，并只在备份副本演练migration
sudo -u "$KCS_USER" env KCS_DB_PATH="$DB" KCS_BACKUP_DIR="$BACKUP_DIR" \
  npm --prefix "$APP" run predeploy:kcs
sudo -u "$KCS_USER" env KCS_DATA_DIR=/var/lib/kcs/data \
  node "$APP/scripts/cloud-migration-rehearsal.mjs" --backup "$RAW_BACKUP" --snapshot "$SNAPSHOT"

sudo -u "$APP_USER" -H npm --prefix "$APP" run lint
sudo -u "$APP_USER" -H npm --prefix "$APP" run build
sudo -u "$APP_USER" -H npm --prefix "$APP" test

# 以上全部通过后，才对原AWS数据库执行独立的schema-v17-only migration。
# 此命令不会载入server/database.mjs，因此不会执行车辆规范化、seed或其他启动期资料整理。
sudo -u "$KCS_USER" env KCS_DB_PATH="$DB" KCS_DATA_DIR=/var/lib/kcs/data \
  npm --prefix "$APP" run migrate:kcs
sudo -u "$KCS_USER" env KCS_DB_PATH="$DB" \
  node "$APP/scripts/cloud-preflight.mjs" --mode after --snapshot "$SNAPSHOT"

sudo systemctl start kcs-api
sudo systemctl --no-pager --full status kcs-api
curl --fail --silent --show-error https://dispatch.leesaiker.com/api/health
curl --fail --silent --show-error https://dispatch.leesaiker.com/api/auth/session
```

`cloud:preflight --mode after` 会阻止 Employee/Auth Account 数量下降，并逐一验证原 Employee ID、Employee Code、姓名、账号 ID、Username、启用状态及密码哈希指纹不变。因此 AWS 比本机多出的 EMP0003 和第二个账号必须保留。

登录与权限核对必须使用浏览器进行：

1. `kcadmin` 登录成功且显示 `owner_admin`。
2. EMP0003 使用原账号登录成功，Employee ID、Employee Code 与历史不变。
3. Operations Admin 可管理普通账号，但修改 Owner、提升 Owner 或读取敏感资料返回 403。
4. Driver/Crew 只能进入手机页面。

Caddyfile 本批次不需要改变。只有管理员确认配置确实有 diff 时才执行：

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

否则不要 reload Caddy。正式域名继续为 `https://dispatch.leesaiker.com`，旧 sslip.io 入口保留。

## Ubuntu 完整回滚

以下命令中的 `BACKUP_DIR` 必须换成该次部署实际目录。回滚先用仍在 v17 工作树内的恢复脚本恢复数据库，再切回部署前 Commit：

```bash
set -euo pipefail
APP=/opt/kcs-app
DB=/var/lib/kcs/data/kcs-dispatch.db
APP_USER="$(stat -c '%U' "$APP")"
KCS_USER="$(systemctl show -p User --value kcs-api)"
KCS_USER="${KCS_USER:-root}"
BACKUP_DIR=/var/lib/kcs/backups/v17-YYYYMMDDTHHMMSSZ
RAW_BACKUP="$BACKUP_DIR/kcs-dispatch-before-v17.sqlite"
PRE_V17_COMMIT=4d2b248

sudo systemctl stop kcs-api
sudo -u "$KCS_USER" env KCS_DB_PATH="$DB" KCS_BACKUP_DIR="$BACKUP_DIR" \
  npm --prefix "$APP" run rollback:kcs -- --backup "$RAW_BACKUP" --confirm
sudo -u "$KCS_USER" sqlite3 "$DB" "PRAGMA integrity_check;"

sudo -u "$APP_USER" -H git -C "$APP" checkout --detach "$PRE_V17_COMMIT"
sudo -u "$APP_USER" -H npm --prefix "$APP" ci
sudo -u "$APP_USER" -H npm --prefix "$APP" run build
sudo systemctl start kcs-api

curl --fail --silent --show-error https://dispatch.leesaiker.com/api/health
sudo -u "$KCS_USER" sqlite3 "$DB" \
  "SELECT 'employees',COUNT(*) FROM employees UNION ALL SELECT 'auth_accounts',COUNT(*) FROM auth_accounts;"
sudo -u "$KCS_USER" sqlite3 "$DB" \
  "SELECT e.id,e.employee_code,e.name,a.id,a.username,a.is_active FROM employees e LEFT JOIN auth_accounts a ON a.employee_id=e.id WHERE REPLACE(UPPER(e.employee_code),'-','')='EMP0003';"
```

恢复脚本会先 checkpoint 当前 WAL、验证当前库、建立 `before-rollback` 安全副本，再恢复已验证的 pre-v17 备份。Caddy 配置未改变时不 reload。确认稳定后，另行决定何时把 Git 工作树切回 `main`。

## 测试方法

```powershell
npm run lint
npm run build
npm test
npm run verify:data
```

重点验证：

1. UTC 16:00 跨入古晋下一日；7 月 23 日视角下 24 日为明天、25 日为后天。
2. 三语言登录、手机核心操作、一周派车快捷按钮及账号记忆。
3. 返回、浏览器返回与 dirty state 确认。
4. Owner 身份修改、Operations 允许项和越权拒绝、Username 唯一。
5. 所有密码输入默认隐藏且眼睛按钮彼此独立。
6. 手机 390×844 无横向溢出。
7. 正式域名登录页、`/api/health`、`/api/auth/session` 与 HTTPS。
8. 使用包含 4 名员工、2 个账号和 EMP0003 的 AWS 型 fixture 验证 migration 幂等及完整保留。
9. 正式部署前必须用 production backup rehearsal；本机旧数据库结果不能代替 AWS preflight。
10. 点击账号姓名只打开 Profile 菜单；Owner 显示 `owner_admin`，有权限者才显示 Account Management。
11. 主动改密可取消且成功后 Session 仍有效；临时密码和管理员重设密码才强制，完成后 `must_change_password=0`。
12. 登录页三语言即时切换；登录后顶栏没有重复语言下拉框，Profile 修改语言会即时生效并写入账号，下次登录继续使用。
13. 桌面及 390×844 Driver/Crew 手机页面无横向溢出，Profile 菜单保持在 viewport 内。

## 地址与地点规范

Customer/Branch 地址、道路、城市、州、Company Yard、Employee Base、Buyer、Workshop、Fuel Station、Operational Location 和地图显示使用同一原始名称。界面语言只影响标签和说明；导入、导出或语言切换不得翻译实际地点值，以免产生重复地点。

## 常见错误

- `auth/session 404`：旧 API 仍占用 8787；使用 `npm run dev`，启动器会先识别并关闭旧 KCS 进程。
- preflight 找不到 EMP0003、账号数少于 2 或正式数量下降：立即停止，不执行 migration。
- rehearsal 失败：正式数据库尚未改变；保留备份与 snapshot，修正代码后重新开始。
- migration/postflight 失败：不要启动 API，使用本次 `RAW_BACKUP` 完整回滚。
- 语言出现英文：代表该 key 缺少目标语言；开发 Console 会记录 `[i18n] Missing ...`，补翻译后再发布。
- 手机 GPS 失败：必须从 HTTPS 正式域名或浏览器允许的安全局域网环境进入，并授予 Location；不要把密码或 GPS 放进 URL。
- Operations 收到 403：先确认目标不是 Owner/Operations、操作不是 Username/System Role/敏感授权；这是预期的服务端保护。
- 点击姓名直接出现“首次登录修改密码”：确认前端已更新，并检查 `/api/auth/session` 的 `mustChangePassword`。若为 `false`，应显示 Profile 菜单；若为 `true`，代表账号仍在使用临时或管理员重设密码。
- 改密后回到登录页：检查浏览器是否仍有 `kcs_session` HttpOnly Cookie、API 服务时间及 `/api/auth/session`；正常改密不会撤销现有 Session。

## 备份与维护

数据库、备份、附件、照片、Excel、`.env` 与日志全部位于 Git 忽略范围。备份需包含 SQLite 与 `data/uploads`；外部备份应加密并限制访问。未来新增语言 key 必须同步三种语言或接受 English fallback 警告。新增日期逻辑必须复用 `kuchingTime.js`，不得以 `toISOString().slice(0,10)` 判断业务日期。
