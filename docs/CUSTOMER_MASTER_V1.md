# KCS Customer Master & Operational Location Foundation V1

## 开发说明

本版本把 KCS 从“读取 Jodoo 客户资料”推进为正式客户主档。现有 React、Node.js 与 SQLite 架构保持不变，数据库由 v13 兼容升级到 v14；既有 253 个 Customer、475 个 Branch、排程、GPS、导入记录与 Dispatch 快照不会被删除或重建。

新增能力包括 Customer Master、Customer Branch Master、GPS Collector、Buyer Master、Operational Location Master，以及七类主档的 Excel/CSV 模板、预览、事务导入、错误导出和资料导出。

## 管理员操作步骤

1. 打开左侧“客户与营运地点”。
2. 顶部检查 Area 收口统计。正式数据库当前为 97 个已确认、0 个待确认；每个 Zone 的 Area 数量会实时显示。
3. 在 Customer 页建立客户，再到 Branch 页为该 Customer 建立一个或多个 Branch。
4. Customer ID 与 Branch ID 建立后不可直接改号；如编号确实错误，应由管理员通过审计流程处理，避免破坏交易关联。
5. 使用 Active、Paused、Closed 管理状态。系统不提供物理删除已有历史资料的操作。
6. 修改客户名称、Branch、Area、地址、official GPS、收货周期、星期、时间限制、OCC Price、Payment Type 或状态时，相关未来已批准/已发布路线会转为 Reapproval Required。

## Customer 与 Branch 资料规则

- 新资料 `source_system` 标记为 `KCS`；历史 Jodoo 导入资料保留为 `Jodoo`。
- Customer 可有多个 Branch，`Customer ID` 与 `Branch ID` 均为全局唯一。
- Branch 的 OCC Price 与 Payment Type 优先于 Customer 默认值；Branch 未填写时使用 Customer 默认值。
- 暂停或关闭只改变状态，不删除主档、排程、Dispatch 或交易历史。
- 关键修改写入 `master_change_history`，包含修改前后资料、原因、操作人和时间。

## GPS 流程

1. 员工先搜索并选择 Customer Branch。
2. 输入或采集经纬度，选择来源后保存。
3. 系统写入 `temporary_locations`，状态为 `pending_supervisor`；不会覆盖 Branch 的 official GPS，也不会自动修改 Area 或 Zone。
4. 主管核对 Branch、旧 official GPS 与 temporary GPS 后，填写理由并按“采用为 official GPS”。
5. 系统保存旧 GPS、新 GPS、审批人、审批时间、理由与距离差异；距离超过 500 米显示警告。
6. official GPS 变化会重新计算 GPS Zone recommendation，但 recommendation 仍不能自动修改 Area/Zone。

## Buyer 与 Operational Location

Buyer 是卖货、卸货对象，不与 Customer 共用表。Buyer 可保存接受物料、营业时间、卸货限制和价格备注。

Operational Location 支持：

- Company Yard
- Buyer
- Employee Base
- Workshop
- Fuel Station
- Other

地点可作为路线起点或终点；Buyer 类型地点可以关联 Buyer ID。

## Excel / CSV 导入导出

支持模块：Customer、Customer Branch、Zone、Area、GPS、Buyer、Operational Location。

标准流程：

1. 选择模块并下载 XLSX 或 CSV 空白模板。
2. 保留第一行栏位名称，填写资料；编号栏不得重复。
3. 选择 `.xlsx` 或 `.csv` 文件并按“导入前预览”。
4. 检查 Total、New、Update、Unchanged、Error。
5. Error 大于 0 时无法提交；先导出错误 XLSX、修正原文件并重新预览。
6. Error 为 0 后按“确认导入 SQLite”。正式写入使用 transaction，失败时整体回滚。
7. 相同编号使用 upsert；相同资料再次导入显示 Unchanged，不产生重复记录。
8. 可导出全部资料，或从 Customer/Branch 页面导出当前搜索结果。文件名自动包含日期时间。

GPS 导入模板的 `GPS Type` 默认使用 `Temporary`。只有主管明确填写 `Official` 并通过正式导入操作时才更新 official GPS。

导入预览、错误、提交和导出操作分别保存在 `import_batches`、`import_errors`、`import_staged_rows` 与 `data_transfer_logs`。系统不保存原始 Excel 文件。

## 数据库变更（v14）

兼容扩展：

- `customers`：法定名称、注册号、账单地址、联系人、通讯资料、默认付款方式、账期、状态、备注、资料来源与建立审计。
- `branches`：联系人、收货周期/星期、价格、付款方式、证明要求、车辆限制、状态、备注与资料来源。
- `areas`：`zone_confirmed_by`、`zone_confirmed_at`。
- `operational_locations`：Location ID、营运类型、营业时间、联系人、状态、Buyer 关联与建立审计。

新增表：

- `buyers`
- `master_change_history`
- `data_transfer_logs`

没有删除旧表，没有修改旧 Dispatch 的 `zone_group_name_snapshot` 或 `area_name_snapshot`。

## API

- `GET|POST /api/customers`
- `GET|PATCH /api/customers/:customerId`
- `GET|POST /api/master/branches`
- `GET|PATCH /api/master/branches/:branchId`
- `GET /api/master/audit`
- `GET /api/master/area-closeout`
- `GET|POST /api/gps-collector`
- `POST /api/gps-collector/branch/:branchId`
- `POST /api/gps-collector/:temporaryLocationId/adopt`
- `GET|POST /api/buyers`
- `PATCH /api/buyers/:id`
- `GET|POST /api/operational-locations`
- `PATCH /api/operational-locations/:id`
- `GET /api/master-transfer/:module/template`
- `GET /api/master-transfer/:module/export`
- `POST /api/master-transfer/preview`
- `POST /api/master-transfer/commit`
- `GET /api/master-transfer/logs`

## 测试方法

```powershell
npm.cmd run lint
npm.cmd run build
npm.cmd test
npm.cmd run dev
```

自动测试覆盖唯一编号、多 Branch、状态和审计、关键资料导致路线重新审批、temporary/official GPS 隔离、GPS 审批距离警告、Buyer/Location 分离、预览后才写入、事务错误保护、幂等导入、Area 收口及七类模板。

## 备份与恢复

1. 停止 KCS 服务，避免复制时仍有写入。
2. 备份整个本机 `data/` 目录到受控且加密的位置；该目录包含 SQLite、WAL 和上传附件。
3. 恢复时先保留当前 `data/` 副本，再用同一时间点的完整备份替换 `data/`。
4. 启动系统，检查 `/api/system/status`、Customer/Branch 数量、97 个 Area 状态及最近导入批次。
5. 不要把备份、SQLite 或附件上传 GitHub。

正式生产建议增加自动每日备份、异地加密副本、保留周期和定期恢复演练。

## 权限与安全影响

- 当前界面以 Supervisor 工作流实现，但尚未完成正式登录和服务端 RBAC。生产上线前必须把操作人从登录身份取得，不能信任浏览器传入的名称或角色。
- `.gitignore` 排除 `data/`、`uploads/`、Excel、SQLite、照片、`.env`、日志与原始资料目录。
- 导出含客户资料，应只保存在公司授权位置并限制传输。
- Excel/CSV 输出会对可能触发公式的文本加前置单引号，降低 spreadsheet formula injection 风险。
- 依赖安装已通过 `npm audit`，当前为 0 个已知漏洞。

## 未来 Jodoo 切换计划

阶段 1（当前）：KCS 建立和维护 Customer/Branch/价格/GPS；Jodoo 继续开单。

阶段 2：建立稳定 KCS→Jodoo 开单资料映射与异步队列；KCS 成为 Customer/Branch source of truth，Jodoo 只接收必要开单字段与照片。

阶段 3：完成身份权限、失败重试、对账、冲突处理与切换演练后，停止以 Jodoo Excel 作为日常主档更新来源。旧 Jodoo 编号继续保留，避免破坏历史单据关联。

