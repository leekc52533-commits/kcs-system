# KCS Dispatch System

KCS 司机派送与回收作业系统。当前版本包含司机顺序流程、Jodoo Excel 正式导入、SQLite 客户/分店/排程/GPS 主档、资料质量页面、主管一周派车、临时收货请求、GPS-Based Zone Recommendation V1，以及 Jodoo（简道云）连接的后台骨架。

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

SQLite schema 目前为 v13。`branches` 保留现有架构，同时保存原始 CustomerID/AreaID，方便显示未匹配关联并保证重复导入幂等。v10 增加完整车辆资料、合规提醒、保养、燃油、轮胎、文件、状态与使用历史；v11 取消 Zone 数量限制，增加 Area 归属确认状态与派车 Zone/Area 快照；v12 分开保存 Area 当前待确认 Zone 与最后已确认 Zone；v13 增加 Zone 边界版本、GPS 推荐与主管决定历史。升级不会删除既有周计划、Trip 或站点。Route Ready 规则集中在 `shared/importRules.js`：至少一条有效排程、有效经纬度，并且客户/分店状态不是 Paused、Closed 或 Ended；当前没有来源状态时视为 Active。

## GPS-Based Zone Recommendation V1

- 左侧进入“GPS Zone 建议”。`Zone Boundary Map` 使用 OpenStreetMap/Leaflet，不需要 Google Maps API Key；地图底图需要网络连接，polygon 与推荐资料保存在本机 SQLite。
- 主管选择 Zone 后点击地图逐点绘制边界，或复制当前边界修改，再保存为新版本。每个版本保存 polygon、可选中心点、版本号、effective date 与 active status；旧版本不会被覆盖。
- 保存边界或导入新的 official GPS 后会重新计算建议。单一 polygon 内为 High；边界线上为 Medium；重叠 Zone 标记 Boundary Conflict；polygon 外显示最近边界及距离。
- 没有 polygon 时，系统综合最近 official GPS 客户、最近 Area GPS 中心及可用 Zone 中心产生 recommendation only。当前没有道路距离矩阵，界面会明确说明距离为直线近似，不会冒充公路行驶距离。
- temporary GPS 从不参与建议。只有主管按“接受建议”或“确认其他归属”后，Branch 的正式 Area 才会改变；保持原归属、稍后处理和批量确认 High 均会保存决定与审计资料。
- 边界修改只重新计算建议，不自动覆盖主管确认结果。旧 Dispatch 继续使用保存于 `dispatch_stops` 的 Area/Zone 快照。

完整技术设计、算法说明及操作流程见 [`docs/GPS_ZONE_RECOMMENDATION_V1.md`](docs/GPS_ZONE_RECOMMENDATION_V1.md)。

## 一周派车与每日发布

1. 进入“一周派车”。“今天”“明天”“后天”和“其他日期”进入单日视图，只读取所选一天；“未来 7 天”才进入连续七日周视图。
2. 单日视图按“更新当天草稿”，周视图按“更新 7 天草稿”。系统读取 `BranchSchedule` 幂等建立所需日期；`Call` 排程不会自动加入，两周一次排程会使用 Take Date/Next Take Date 作为周期锚点。
3. 每天的车辆栏只来自 Vehicle Master 中当天可用的车辆。自动草稿默认显示五辆常用车 `Lorry 2` 至 `Lorry 6`；`Lorry 1 — QAV3468 — Available` 随时可在车辆选择器直接选用，不需要先启用。系统不会根据 Area、客户、Schedule 或 Trip 数量制造车辆栏。
4. 新产生的客户先进入“未分配客户池”。客户池按 `Zone Group → Area → Customer` 默认折叠；展开 Zone 后才显示详细 Area 和客户。Zone、Area 和单个客户都可整体拖到车辆的任一 Trip；一个 Zone 可拆给多辆车，一辆车也可接收多个 Zone。Zone 不绑定车辆或司机。
5. 所有车辆选择器统一显示 `Lorry Number — Registration Number — Status`。车辆选择器同时显示 Capacity、Default Base 和 Preferred/Usual Areas；Maintenance、Inactive 与 Sold 默认隐藏，可切换查看但不能选择。基地、惯用 Area 和 Zone Group 都只作建议，不会强制绑定车辆或司机。
6. Driver 选择器只列 Employee Master 的 Driver，可按姓名或员工编号搜索，并显示任职状态、默认基地/区域和当天分配。司机同一天不能重复分配，必须先在原车辆按“解除当前司机分配”。Assistant/Crew 支持搜索和多选。Start/End Location 从 Location Master 选择。只有主管按“新增临时车辆”才会为指定日期增加额外车辆。
7. 可把站点拖到其他日期、车辆或趟次，也可调整顺序并锁定客户顺序。
8. 每天分别按“批准”或“批准并发布”。`GET /api/driver/today?driverId={id}` 只返回电脑当天、已发布且分配给该司机的路线。
9. 已批准/已发布路线改变后会变成 `reapproval_required`。再次批准人与时间、版本，以及修改前后 JSON 会写入审批和变更记录。

## Vehicle Management、Employee、Location 与 Zone Group Master

- 在侧栏进入“员工、车辆、地点与区域”，可切换四个 Master 页面。
- Vehicle Master 已固定建立六辆正式车辆：`Lorry 1 — QAV3468 — Available`、`Lorry 2 — QAA4293N — Active`、`Lorry 3 — QAB1225B — Active`、`Lorry 4 — QM3028M — Active`、`Lorry 5 — QTY5028 — Active`、`Lorry 6 — QM630S — Active`。编号按购买先后保存。
- `QTW2704` 以 Sold 状态保留历史，不进入派车或任何到期提醒，也不能物理删除。Maintenance、Inactive 和 Sold 车辆均不可派车。
- 按“查看详情”进入独立车辆页面，可维护品牌、型号、年份、注册资料、底盘/引擎编号、重量、营运容量、基地、惯用 Zone 和备注；Current Driver 只从派车历史读取，不会永久写入车辆。
- 法定提醒支持 Puspakom、Road Tax、Insurance、Loan、Next Service Date/Mileage，并按 30 天黄、14 天橙、7 天红、过期严重警告显示。保养、燃油、轮胎、使用历史和车辆文件各自保存独立记录。
- 若当天车辆故障，车辆卡上的“整车转移”会把 Trip、客户路线、司机和跟车员转给可用目标车辆；主管可同时把原车设为 Maintenance，转移前后内容与操作者会写入变更及状态历史。
- 发票、收据、车辆文件和照片只写入本机 `data/uploads/vehicles/`。前端接受 JPG、PNG、WEBP 或 PDF，单一附件上限 8 MB；这些文件不会进入 GitHub。
- Employee Master 可新增员工、设定 Driver/Assistant 等角色，并启用或停用。派车页不会自行制造司机或跟车员。
- Location Master 可新增出发／结束地点，并分别设定是否允许作为 Start 或 End Location。
- Zone Group Master 不限制 Zone 数量。当前初始化七区：古晋 A区、古晋 B区、西连 A区、西连 B区、Samarahan A区、Samarahan B区、伦乐 / 石隆门区。主管可新增、改名、调整顺序、停用、重新启用、合并或拆分；以后可独立建立伦乐区、石隆门区或其他营运区。
- 每个 Area 必须保留一个 Zone 关联。迁移不会猜测 97 个 Area 的最终归属：明确的 AKSES LUNDU、PASAR LUNDU 和 BAU 已归入“伦乐 / 石隆门区”并标记已确认，其余保留原关联并显示“待确认”。主管重新选择或确认当前 Zone 后才改为“已确认”。
- 拆分只建立新 Zone 并移动主管勾选的 Area；合并会把来源 Zone 的 Area 移到目标 Zone，再停用来源 Zone，不会删除来源 Zone。上述操作不修改客户、BranchID、GPS、排程或路线历史。
- `dispatch_stops` 保存产生路线当时的 Zone Group 与 Area 名称快照。旧路线继续显示旧快照；调整归属后新产生的派车才读取最新 Zone。
- Zone Area Confirmation 工作台默认只显示待确认 Area，可按名称、当前 Zone、GPS 状态筛选，并按客户数量排序。Zone 卡片显示 Area 确认进度、Branch、GPS 与固定排程统计；点击 Area 可查看分店、地址、正式 GPS、固定周期/星期、历史派车与已有收货重量，以及 GPS 足够时的相邻 Area。
- Zone 卡片内的 Area 总数、已确认、待确认、Customer Branch、official GPS、缺 GPS 与已排客户数字均可点击，并在右侧只读 Drawer 查看明细。明细支持搜索、Area 筛选和排序；official GPS 可切换 Area 汇总或 Branch 明细。只有“待确认”明细提供确认归属按钮，其余统计明细不会修改资料。
- Area 总数、已确认和待确认 Drawer 另提供 Supervisor 专用的 Area 多选、全选当前筛选结果、清除选择及批量移动。移动必须选择目标 Zone、填写原因并再次确认；移动后 Area 明确变为“归属已调整／待确认”，不会改动 BranchID、CustomerID、GPS、Schedule 或旧 Dispatch 快照。每个 Area 的旧/新 Zone、操作人、时间与原因都会保存到 `audit_logs`。
- 单个或批量移动 Area 后仍为“待确认”，不会马上改变新路线使用的 Zone；主管必须另按“确认归属”才正式生效。可批量确认或撤销确认，所有移动、确认与撤销都会写入 `audit_logs`。这些操作不会修改 BranchID、CustomerID、GPS、固定 Schedule 或历史 Dispatch。

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
- `POST /api/dispatch/day/:date/assign-area`
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
- `GET|POST /api/zone-groups`、`PATCH /api/zone-groups/:id`
- `GET /api/zone-groups/:id/metric-details`（`metric=areas|confirmed|pending|official_gps|missing_gps|branches|scheduled`，支持 `view`、`search`、`areaId`、`sort`）
- `POST /api/zone-groups/:id/deactivate|reactivate`
- `POST /api/zone-groups/merge`、`POST /api/zone-groups/split`
- `PATCH /api/areas/:id/zone-group`
- `GET /api/areas/:id/zone-confirmation`
- `POST /api/areas/bulk-zone-group`、`POST /api/areas/bulk-confirmation`
- `POST /api/areas/bulk-zone-group` 的移动请求必须包含 Supervisor 角色、操作人及非空 `reason`；成功后返回更新后的 Area，并由前端刷新 Zone 统计。
- `GET /api/zone-boundaries`、`POST /api/zone-groups/:id/boundaries`
- `GET /api/gps-zone-recommendations`、`POST /api/gps-zone-recommendations/recalculate`
- `POST /api/gps-zone-recommendations/:id/decision`
- `POST /api/gps-zone-recommendations/bulk-confirm-high`
- `POST /api/vehicles`、`PATCH /api/vehicles/:id`、`POST /api/vehicles/temporary`
- `GET /api/vehicles/:id`
- `POST /api/vehicles/:id/compliance|maintenance|fuel|tyres|documents|usage`
- `POST /api/dispatch/day/:date/vehicle/:vehicleId/transfer`
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

## Customer Master & Operational Location Foundation V1

KCS 现在是新 Customer、Customer Branch、official/temporary GPS、Buyer 与 Operational Location 的主要维护入口；Jodoo 暂时只继续用于开单。左侧“客户与营运地点”包含：

- Customer Master：新增、查看、编辑、暂停、恢复、关闭、搜索、筛选和审计。
- Customer Branch Master：一个 Customer 多 Branch，价格、付款方式、收货周期、GPS、Area/Zone 与营运限制分开维护。
- GPS Collector：先保存 temporary GPS，主管填写理由并采用后才更新 official GPS；不会自动修改 Area/Zone。
- Buyer Master：与 Customer 分表，用作卖货、卸货和路线终点。
- Operational Location：Company Yard、Buyer、Employee Base、Workshop、Fuel Station、Other。
- Excel / CSV：七类主档均支持空白模板、预览、New/Update/Unchanged/Error、错误导出、事务提交、幂等导入及带时间戳导出。

数据库 schema 已升级到 v14。现有 253 个 Customer、475 个 Branch 与 97 个已确认 Area 原样保留；旧 Dispatch 的 Area/Zone snapshot 不会改变。详细开发、管理员操作、API、导入导出、GPS、备份、安全和 Jodoo 切换说明见 [Customer Master V1](docs/CUSTOMER_MASTER_V1.md)。

2026-07-19 本机五份来源文件首次实际导入结果：1,216 行；新增 1,099、更新 0、没有变化 115、无法匹配排程 2。导入后共有 253 个客户、475 间分店、276 条排程（其中 2 条 BranchID 未匹配）、118 间有效 GPS、106 间 Route Ready。再次导入相同五份文件时新增 0、更新 0、没有变化 1,214、无法匹配 2，验证没有产生重复主档。
