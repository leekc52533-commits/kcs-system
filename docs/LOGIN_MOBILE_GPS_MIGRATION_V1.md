# KCS Login、Employee Permission、Mobile GPS Access & GPS Migration V1

## 范围与资料保护

本阶段从提交 `060da42` 和 SQLite schema v14 升级到 v15。现有 Customer Master、Customer Branch Master 与 GPS Collector 没有重建。系统继续使用：

- `GET /api/gps-collector`
- `POST /api/gps-collector/branch/:branchId`
- `POST /api/gps-collector/:id/adopt`
- `temporary_locations → 主管审批 → branches official GPS`

升级核对结果：253 Customer、475 Branch、97 Area、9 Active Zone、118 official GPS。MJC、Otw Sri Aman 与主管建立的其他 Zone 均保留。

## 首次登录与账号管理

1. 启动系统后，若没有任何账号，登录画面会显示“首次建立管理员”。
2. 填写管理员员工编号、姓名、个人用户名和临时密码（至少 8 位）。
3. 使用该账号登录；首次登录必须修改密码。
4. 进入“员工、车辆、地点与区域 → Employee Master”，先建立员工，再按“建立登录账号”。
5. Job Role 与 System Role 分开。Job Role 支持 Driver、Attendant / Crew、Supervisor、Office、Admin、Mechanic / Workshop、Other；同一员工可增加兼任岗位。
6. System Role 支持 admin、supervisor、office、driver、crew。停用账号或非 Active 员工不能登录。

密码使用 Node.js scrypt 加盐哈希。Session token 只以 SHA-256 摘要存入 SQLite，浏览器使用 HttpOnly、SameSite=Strict Cookie。连续 5 次登录失败锁定 15 分钟。账号建立、登录成功/失败、停用、解锁和密码修改写入 `auth_audit_logs`。

## 权限

- Admin / Supervisor：桌面管理、账号、GPS 审批、GPS 迁移冲突处理。
- Office：桌面营运与 GPS 迁移预览；不能审批 official GPS、管理账号或决定 GPS 冲突。
- Driver / Crew：只进入手机简化画面与 temporary GPS 采集 API。

Driver/Crew 服务端禁止访问 Customer Master、价格、Zone/Area、设置、导入导出、财务、账号和其他后台 API。手机今日路线只返回当天、已 Published、且本人作为 Driver 或 Crew 参与的路线，并移除价格、付款方式及 official GPS 坐标。

## 手机 GPS 流程

1. Driver/Crew 登录后打开“GPS采集”。
2. 从今日路线选择站点，或按 Customer、Branch、BranchID 搜索。
3. 按“取得当前 GPS”。系统保存 latitude、longitude、accuracy、设备时间、服务器时间、Employee、可选 Dispatch/Stop、备注。
4. 必须拍摄现场或招牌照片。附件只写入 `data/uploads/gps/`，不进入 GitHub。
5. 提交后只写入 `temporary_locations`，员工不能覆盖 official GPS。
6. Supervisor 在现有 GPS Collector 查看地图资料、准确度、照片和与 official GPS 的差异，并选择采用、保留 official、拒绝或要求重新采集。
7. 采用后写入 Branch official GPS、保存旧新位置与审批记录，并令受影响的已批准未来路线失效、要求重新审批。

普通 HTTP 的局域网页面通常不被手机浏览器视为安全环境，Geolocation 可能被禁止。LAN 测试可先验证登录、页面与 API；正式现场 GPS 必须部署 HTTPS。Session 目前 12 小时到期。

## 临时新客户

手机“临时客户”只建立 Potential New Customer / Pending Collection，不会建立正式 Customer 或 Branch。Supervisor/Office 在现有 Special Collection Request 和 Customer Master 补齐 CustomerID、BranchID、价格、付款方式、地址、Zone、Area。连接正式 Branch 后，原 temporary GPS 会关联该 Branch，仍需 Supervisor 采用才成为 official GPS。

## Jodoo 旧 GPS 迁移

1. 进入“旧 GPS 迁移”，下载 XLSX 空白模板或准备 CSV。
2. 保留 BranchID 的前导零；填写 Latitude/Longitude，可附 CustomerID、Customer Name、Branch Name 供查核。
3. 上传后先预览：New、Unchanged、Conflict、Branch Not Found、Invalid GPS、Duplicate Source。
4. “确认迁移”只写入没有 official GPS 的 New 项。Conflict 绝不自动覆盖。
5. Supervisor 对 Conflict 逐笔选择保留 official、采用导入或拒绝，并填写原因。
6. 相同文件内容使用 SHA-256 幂等识别，不产生重复批次或重复 GPS。

迁移批次和逐行决定保存在 `gps_migration_batches`、`gps_migration_rows`。它们是迁移暂存/审计，不是第二套 GPS 主档。

## 新增主要 API

- `GET /api/auth/setup-status`
- `POST /api/auth/bootstrap`
- `POST /api/auth/login`
- `GET /api/auth/session`
- `POST /api/auth/change-password`：验证当前密码、更新 scrypt hash、清除 `must_change_password`，并保持现有 Session。
- `POST /api/auth/logout`
- `GET|POST /api/auth/accounts`
- `PATCH /api/auth/accounts/:id`
- `GET /api/auth/audit`
- `GET /api/mobile/today`
- `GET /api/mobile/branch-search`
- `GET /api/mobile/submissions`
- `POST /api/mobile/temporary-customers`
- `POST /api/gps-collector/:id/review`
- `GET /api/gps-collector/:id/photo`
- `GET /api/gps-migration/template`
- `GET /api/gps-migration/batches`
- `POST /api/gps-migration/preview`
- `POST /api/gps-migration/batches/:id/commit`
- `POST /api/gps-migration/rows/:id/resolve`
- `GET /api/system/network`

## 数据库 v15

新增 `auth_accounts`、`auth_sessions`、`auth_audit_logs`、`employee_job_roles`、`employee_role_history`、`gps_migration_batches`、`gps_migration_rows`。现有 `temporary_locations` 只增加采集、照片和审批字段；没有新增第二张 Customer、Branch 或 GPS Collector 主表。

## Account/Profile 与密码流程

桌面及手机右上角员工姓名只打开 Profile 菜单。菜单显示员工姓名、Username、Employee Code、System Role、Preferred Language、Change Password、按权限显示的 Account Management，以及 Logout。登录后顶栏不再提供第二个语言选择器；Preferred Language 可直接选择 Bahasa Melayu、中文或 English，立即切换并调用账号 Preferences API 自动保存。`kcadmin` 始终解析为 `owner_admin`；System Role 不会覆盖 Employee Job Role。

普通用户主动 Change Password 时可取消，成功后继续使用原 Session。首次临时密码和管理员重设密码会设置 `must_change_password=true`，登录后只允许修改密码、语言或退出；成功修改后清除该标志。密码、明文新旧值及密码哈希不会写入审计。

登录页始终保留三语言选择。登录请求会一并提交当前语言，后台在成功认证 transaction 内更新现有 schema v17 `preferred_language`；失败登录不会修改偏好。下次登录未另选语言时继续使用浏览器最近选择，登录成功或恢复 Session 后以账号保存值为准。

## 备份、恢复与安全

- 每日备份 `data/kcs-dispatch.db` 及 `data/uploads/`，并定期做离线恢复演练。
- SQLite WAL 运行时备份应使用 SQLite backup API或在安全停机后复制数据库与 WAL/SHM，不能只复制主文件。
- `.env`、数据库、Excel、客户资料、照片、上传文件、日志和密钥不得提交 GitHub。
- 正式上线前配置 HTTPS、可信反向代理、防火墙、Session 清理、备份保留政策和灾难恢复负责人。

## 测试

运行：

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

自动测试覆盖密码哈希、首次改密、停用与锁定、角色隔离、temporary/official GPS 分离、迁移分类/幂等/冲突处理，以及既有资料导入、派车、Zone 与车辆测试。
