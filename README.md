# KCS Dispatch System

KCS 司机派送与回收作业系统。当前版本包含司机顺序流程、Jodoo Excel 正式导入、SQLite 客户/分店/排程/GPS 主档、资料质量页面、主管一周派车、临时收货请求，以及 Jodoo（简道云）连接的后台骨架。

## 运行环境

- Windows 10/11
- Node.js 24 或以上
- npm（随 Node.js 安装）

## 首次安装与启动

```powershell
npm install
npm run dev
```

启动后，终端会显示本机访问地址。Windows 用户也可以双击项目根目录的 `打开KCS系统.bat`，脚本会检查依赖、启动前后端并打开浏览器。

## Jodoo 配置

如需连接 Jodoo，先复制环境变量模板：

```powershell
Copy-Item .env.example .env
```

然后只在本机的 `.env` 填写实际配置。字段说明和连接步骤见 [`docs/JODOO_SETUP.md`](docs/JODOO_SETUP.md)。真实 API、附件上传和 Webhook 能否启用，取决于 Jodoo 账号方案与开放平台权限。

请勿把 `.env`、API Key、Webhook Token、客户资料、司机资料、照片、数据库或运行日志提交到 GitHub。本仓库的忽略规则已排除这些内容。

## 常用命令

```powershell
npm run dev       # 同时启动前端与后端
npm run lint      # 代码检查
npm run build     # 生成正式前端构建
npm test          # 自动测试导入与 Route Ready 规则
npm run preview   # 预览正式构建
```

## 首次导入五份 Jodoo Excel

1. 启动系统后，点击左侧“Jodoo 资料同步”。
2. 一次选择或拖入 `Customer List`、`Customer Branch`、`BranchSchedule`、`AreaInfo`、`Customer Location Update`；文件日期和文件名可以改变。
3. 系统根据工作表名称和必要栏位识别类型，并显示总笔数、新增、更新、没有变化、错误和无法匹配。
4. 核对预览后按“确认导入”。只有此时主档才会在单一 SQLite transaction 内更新。
5. Dashboard、客户与分店、收货排程、GPS 与资料完整度页面会读取更新后的数据库。

重新导入更新后的 Excel 使用相同步骤。CustomerID、BranchID、ScheduleID 和 AreaID 会执行 upsert；完全相同的资料会显示“没有变化”，不会重复新增。`Customer Location Update` 只更新已有 BranchID 的 GPS 资料，找不到 BranchID 时不会建立假分店。

导入历史可通过 `GET /api/import-batches` 检查；某批次的错误可通过 `GET /api/import-batches/{id}/errors` 查看。无法匹配的排程会保留 `ScheduleID` 和原始 BranchID，并出现在资料质量页面。

## 资料 API

- `GET /api/dashboard/summary`
- `GET /api/customer-branches`、`GET /api/customer-branches/:branchId`
- `GET /api/schedules`
- `GET /api/data-quality/summary`
- `GET /api/import-batches`、`GET /api/import-batches/:id/errors`
- `POST /api/import/preview`、`POST /api/import/commit`

SQLite schema 目前为 v7。`branches` 保留现有架构，同时保存原始 CustomerID/AreaID，方便显示未匹配关联并保证重复导入幂等。v7 为车辆增加临时车辆标记和适用日期；升级不会删除既有周计划、Trip 或站点。Route Ready 规则集中在 `shared/importRules.js`：至少一条有效排程、有效经纬度，并且客户/分店状态不是 Paused、Closed 或 Ended；当前没有来源状态时视为 Active。

## 一周派车与每日发布

1. 进入“一周派车”。“今天”“明天”“后天”和“其他日期”进入单日视图，只读取所选一天；“未来 7 天”才进入连续七日周视图。
2. 单日视图按“更新当天草稿”，周视图按“更新 7 天草稿”。系统读取 `BranchSchedule` 幂等建立所需日期；`Call` 排程不会自动加入，两周一次排程会使用 Take Date/Next Take Date 作为周期锚点。
3. 每天的车辆栏只来自 Vehicle Master 中当天可用的车辆。首次升级且车辆主档为空时会建立 `Lorry 1` 至 `Lorry 5`；系统不会再根据 Area、客户、Schedule 或 Trip 数量制造车辆栏。
4. 新产生的客户先进入“未分配客户池”，再拖入某辆车的 Trip 1、Trip 2 或 Trip 3。每辆车固定显示三个趟次槽位；Area 只供参考，可跨车辆或拆给多辆车。
5. Driver、Assistant 从 Employee Master 选择，Start/End Location 从 Location Master 选择。只有主管按“新增临时车辆”才会为指定日期增加额外车辆。
6. 可把站点拖到其他日期、车辆或趟次，也可调整顺序并锁定客户顺序。
7. 每天分别按“批准”或“批准并发布”。`GET /api/driver/today?driverId={id}` 只返回电脑当天、已发布且分配给该司机的路线。
8. 已批准/已发布路线改变后会变成 `reapproval_required`。再次批准人与时间、版本，以及修改前后 JSON 会写入审批和变更记录。

## Vehicle、Employee 与 Location Master

- 在侧栏进入“员工、车辆与地点”，可切换三个 Master 页面。
- Vehicle Master 可新增车辆、改名称，并把状态设为“启用／可用”“已分配”“维修”或“停用”。维修和停用车辆不会出现在当天派车车辆栏；其既有计划与站点仍保留并回到未分配状态供主管处理。
- Employee Master 可新增员工、设定 Driver/Assistant 等角色，并启用或停用。派车页不会自行制造司机或跟车员。
- Location Master 可新增出发／结束地点，并分别设定是否允许作为 Start 或 End Location。

发布会阻挡缺车辆、缺司机、缺 OCC Price、缺 Payment Type，以及潜在新客户缺 CustomerID、BranchID、价格、付款方式、地址或 Location。未正确安排的客户承诺也会阻挡发布，只有这一项可以由主管填写例外原因确认；账号和营运资料缺失不能绕过。

## 临时收货请求

- 先按客户/分店名称、CustomerID、BranchID、电话、WhatsApp 或地址搜索，也可输入 GPS 查找 3km 内分店。
- 找到现有 Branch 时建立 `Existing Customer Request`，带出价格、付款方式、GPS、Area 和排程，再加入指定日期草稿。
- 找不到时建立 `Potential New Customer`。可先保存客户提供的临时 Location 并排进未来草稿；发布前必须在 Jodoo 建立正式账号、重新导入，再连接新账号。
- 勾选 `Promised To Customer` 会进入红色客户承诺清单；发布前检查漏排、错误日期和账号资料。
- 现场 GPS 通过 `POST /api/temporary-locations` 保存，不自动覆盖正式 GPS。主管按“采用为正式 GPS”后才更新 Branch；相距超过 500m 会警告。
- 单次 Move/Cancel/Add Extra/Pause 存入 `schedule_exceptions`，不修改固定排程；永久改期才更新 `branch_schedules`。

## Dispatch V1 数据表与 API

新增 `weekly_dispatch_plans`、`dispatch_days`、`dispatch_trips`、`dispatch_approvals`、`dispatch_change_logs`、`special_collection_requests`、`schedule_exceptions` 和 `temporary_locations`；既有 `dispatch_stops` 以兼容方式扩展，没有删除旧表。

- `GET /api/dispatch/week`、`POST /api/dispatch/generate-week`、`POST /api/dispatch/generate-day`
- `GET /api/dispatch/day/:date`
- `PATCH /api/dispatch/day/:date/vehicle/:vehicleId`
- `POST /api/dispatch/day/:date/approve|publish|reopen`
- `POST /api/dispatch/stops`、`PATCH|DELETE /api/dispatch/stops/:id`
- `PATCH /api/dispatch/trips/:id`
- `GET /api/dispatch/promised-check/:date`
- `GET /api/driver/today?driverId=:id`
- `GET|POST /api/special-requests`、`PATCH /api/special-requests/:id`
- `GET /api/special-requests/customer-search`
- `POST /api/special-requests/:id/schedule|convert-to-existing|link-new-account`
- `POST /api/schedule-exceptions`
- `GET|POST /api/temporary-locations`、`POST /api/temporary-locations/:id/adopt`
- `GET /api/resources`
- `POST /api/vehicles`、`PATCH /api/vehicles/:id`、`POST /api/vehicles/temporary`
- `POST /api/employees`、`PATCH /api/employees/:id`
- `POST /api/locations`、`PATCH /api/locations/:id`

V1 尚未包含 Google Maps 道路优化、实时车辆定位、奖金系统、Jodoo API 自动同步、完整登录/角色权限和员工请假流程。车辆的启用、停用和维修状态已有基础管理。当前司机资料隔离由 API 的日期、发布状态和 driverId 过滤实现；正式上线前必须接入登录身份，不能信任浏览器传入的 driverId。

## 项目结构

```text
src/       React 前端页面与司机工作流程
server/    Node.js API、SQLite 数据库与 Jodoo 连接层
scripts/   本地开发启动脚本
docs/      设置与对接说明
public/    网站公开静态资源
```

运行期间产生的数据保存在本机 `data/` 目录，不进入公开仓库。`.gitignore` 也排除 `uploads/`、`*.sqlite`、`*.sqlite3`、`.env` 和 `01_Source_Data/`。生产使用前应配置备份、访问控制、HTTPS，并完成 Jodoo 测试环境的端到端验证。

2026-07-19 本机五份来源文件首次实际导入结果：1,216 行；新增 1,099、更新 0、没有变化 115、无法匹配排程 2。导入后共有 253 个客户、475 间分店、276 条排程（其中 2 条 BranchID 未匹配）、118 间有效 GPS、106 间 Route Ready。再次导入相同五份文件时新增 0、更新 0、没有变化 1,214、无法匹配 2，验证没有产生重复主档。
