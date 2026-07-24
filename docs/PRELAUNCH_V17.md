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

## 使用方法

登录页右上方可选 Bahasa Melayu、中文或 English。登录后的选择会写入个人账号，其他员工不受影响。Driver/Crew 可在手机顶部切换语言。

Owner Admin 从左侧“账号管理”选择普通账号，可修改 Username/System Role；Operations Admin 只可建立、停用、启用、解锁和重设普通账号。Employee Code 在后台强制不可修改。

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

## 部署与更新

在停止旧服务后执行：

```powershell
git pull --ff-only origin main
npm ci
npm run predeploy:kcs
npm run lint
npm run build
npm test
npm run dev
```

确认：

```powershell
npm run verify:data
Invoke-RestMethod https://dispatch.leesaiker.com/api/health
Invoke-RestMethod https://dispatch.leesaiker.com/api/auth/session
```

部署程序或反向代理继续使用现有配置。正式域名是 `https://dispatch.leesaiker.com`；不要删除旧 sslip.io 入口，直至管理层另行批准。

## 回滚

先完全停止 KCS API，确认 `kcs-dispatch.db-wal` 与 `kcs-dispatch.db-shm` 不存在，再执行：

```powershell
npm run rollback:kcs -- --backup data/backups/kcs-dispatch-predeploy-YYYYMMDDTHHMMSSZ.sqlite --confirm
git checkout <previous-commit> -- .
npm ci
npm run build
npm run dev
```

恢复脚本只接受 `data/backups/` 内通过 integrity check 的备份，并在覆盖前保存一份 `before-rollback` 安全副本。不要在 API 运行中恢复。

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
8. migration 后核心数量及 `PRAGMA integrity_check`。

## 地址与地点规范

Customer/Branch 地址、道路、城市、州、Company Yard、Employee Base、Buyer、Workshop、Fuel Station、Operational Location 和地图显示使用同一原始名称。界面语言只影响标签和说明；导入、导出或语言切换不得翻译实际地点值，以免产生重复地点。

## 常见错误

- `auth/session 404`：旧 API 仍占用 8787；使用 `npm run dev`，启动器会先识别并关闭旧 KCS 进程。
- migration 失败：不要重试写资料，停止服务并从 `data/backups` 回滚。
- 语言出现英文：代表该 key 缺少目标语言；开发 Console 会记录 `[i18n] Missing ...`，补翻译后再发布。
- 手机 GPS 失败：必须从 HTTPS 正式域名或浏览器允许的安全局域网环境进入，并授予 Location；不要把密码或 GPS 放进 URL。
- Operations 收到 403：先确认目标不是 Owner/Operations、操作不是 Username/System Role/敏感授权；这是预期的服务端保护。

## 备份与维护

数据库、备份、附件、照片、Excel、`.env` 与日志全部位于 Git 忽略范围。备份需包含 SQLite 与 `data/uploads`；外部备份应加密并限制访问。未来新增语言 key 必须同步三种语言或接受 English fallback 警告。新增日期逻辑必须复用 `kuchingTime.js`，不得以 `toISOString().slice(0,10)` 判断业务日期。
