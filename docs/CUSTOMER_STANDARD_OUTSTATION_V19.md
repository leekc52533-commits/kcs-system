# Customer Standard / Outstation Price — Schema v19

## 业务模型

本功能适用于每一个 Customer。一个 Customer 保持一个正式主档，可拥有多个 Branch；不会因为 Matang、Sri Aman 或其他地区建立重复 Customer，也不会按地区建立不同价格名称。

每个 Customer、每个 Material 可设置必填 `Standard Price` 和可选 `Outstation Price`。两种价格优先连接现有共享 Price Level，也可使用 Customer 级 Special Price。Branch 只选择 `Standard` 或 `Outstation`，不重复保存新价格数值。

## 数据库变更与兼容

v19 不修改或重写 v18 migration，新增：

- `customer_material_pricing`
- `customer_material_pricing_history`
- `branch_material_price_selections`
- `branch_material_price_selection_history`

`branch_material_prices` 保留为 v18 compatibility data。v19 migration 为现有 Branch Material 建立 `Standard` selection，并暂时保存只读 legacy fallback，保证升级时实际价格不变。主管在 Customer 页面正式确认价格后，该 Customer + Material 的 Branch 会改用 Customer 级稳定关联。

迁移使用唯一键及 `INSERT OR IGNORE`，重复检查不会重复建立 Customer pricing 或 Branch selection。

## 管理员操作

### Customer Material Pricing

1. 进入 `Customer & Locations` → `Customer`。
2. 打开 Customer，在 `Customer Material Pricing` 加入 Material。
3. 选择 Standard 共享 Price Level，或勾选 Customer Special Price。
4. 只有需要远处分店价格时才开启 `Enable Outstation Price`。
5. 开启后选择 Outstation Price Level 或 Customer Special Price。
6. 页面显示 Standard / Outstation Branch 数量及名单。
7. 涉及已分配 Branch 时，保存前必须二次确认并填写原因。

存在 Outstation Branch 时不能直接关闭 Outstation Price；必须先把这些 Branch 改回 Standard，避免产生无价格资料。

### Branch Price Type

1. 先在 Customer 设置 Material Pricing。
2. 建立或打开 Branch。
3. Material 下拉只显示该 Customer 已设置的 Material。
4. 默认选择 `Standard`。
5. 只有 Customer 已启用该 Material 的 Outstation Price 时，才能选择 `Outstation`。
6. 保存后重开仍保留所选类型。

正常页面没有独立 OCC Price，也不使用其他名称代替 `Outstation Price`。

## 价格解析与未来开单

未来开单依次读取 Customer、Branch、Material、Branch 的 Standard/Outstation selection，以及 Customer Material Pricing 对应的共享 Price Level 或 Customer Special Price。

开单确认时必须将 Material、单位、来源、Price Level、实际价格与生效日期写入不可变 transaction line 或 `dispatch_stop_material_prices` 快照。完成单据只读取快照，不跟随当前价格改变。

## 权限与审计

`owner_admin`、`operations_admin` 或明确获授 `price_manage` 的 Supervisor 可修改 Customer Standard / Outstation 设置。普通员工只能读取解析后的 Branch Price List。服务端会拒绝越权 payload，不依赖前端隐藏。

Customer 价格历史保存修改前后设置、Standard/Outstation 受影响 Branch 数量、原因、操作人、时间和生效日期。Branch 类型历史保存旧/新类型、旧/新稳定关联、原因、操作人和时间。关键价格改变会使相关未来已批准路线要求重新批准。

## 自动测试

```bash
npm run lint
npm run build
npm test
node --test test/customerPricingV19.test.mjs
```

覆盖 v18→v19 幂等迁移、现有 Branch 自动 Standard 且原价不变、Customer 多 Material、Branch Standard/Outstation、一次调价、未启用拒绝、Customer Special Price、保存重开、Price List 解析、不可变快照、权限及审计。

## AWS未来部署：v17 → v18 → v19

本次开发不会执行以下命令。获得主管确认后，正式部署必须停止 API、备份正式库，并严格顺序迁移：

```bash
cd /opt/kcs-app
sudo systemctl stop kcs-api
export KCS_DB_PATH=/var/lib/kcs/data/kcs-dispatch.db
export KCS_BACKUP_DIR=/var/lib/kcs/data/backups

sqlite3 "$KCS_DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta;"
sqlite3 "$KCS_DB_PATH" "SELECT COUNT(*) FROM customers; SELECT COUNT(*) FROM branches; SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM auth_accounts;"
sqlite3 "$KCS_DB_PATH" "SELECT e.employee_code,e.name,a.username,a.role,a.is_active FROM employees e LEFT JOIN auth_accounts a ON a.employee_id=e.id WHERE replace(upper(e.employee_code),'-','')='EMP0003' OR lower(a.username)='kcadmin';"

npm run predeploy:kcs
git pull --ff-only origin main
npm ci
npm run migrate:v18
sqlite3 "$KCS_DB_PATH" "PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta;"
npm run migrate:v19
sqlite3 "$KCS_DB_PATH" "PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta;"
npm run lint
npm run build
npm test
sudo systemctl start kcs-api
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS https://dispatch.leesaiker.com/api/health
```

`migrate:v18` 只接受 v17 输入，`migrate:v19` 只接受 v18 输入；任一步版本不符都会停止。两个脚本核对 Customer、Branch、Employee 与账号数量不变并执行 integrity check。不得把本机 SQLite 上传覆盖 AWS。

## 回滚

使用 `predeploy:kcs` 输出的真实备份文件：

```bash
cd /opt/kcs-app
sudo systemctl stop kcs-api
export KCS_DB_PATH=/var/lib/kcs/data/kcs-dispatch.db
export KCS_BACKUP_DIR=/var/lib/kcs/data/backups
git checkout e76a1bf
npm ci
npm run build
npm run rollback:kcs -- --backup data/backups/<PREDEPLOY_BACKUP_FILE>.sqlite --confirm
sudo systemctl start kcs-api
curl -fsS http://127.0.0.1:8787/api/health
sqlite3 "$KCS_DB_PATH" "PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta;"
```

备份、WAL、数据库、上传附件及环境变量不会进入公开 GitHub。

## Branch编辑修正（v19，无migration）

### 管理员操作

1. 在 Customer Material Pricing 选择 Standard 或 Outstation Price Level 后，确认下方立即出现实际 `RM/kg`。
2. 在 Branch 选择 Material，再选择 Standard 或 Outstation；下拉选项与下方摘要都会显示该 Branch 实际使用价格。
3. 保存成功后 Modal 自动关闭并刷新 Branch 清单。若 Modal 保留，表示 API 保存失败，应按字段错误修正后重试。
4. Collection Frequency 可以暂时留空。旧资料若含可识别名称会标准化；无法识别的旧值会显示警告，单纯修改价格不会覆盖或验证该旧值。

### 错误处理

- `Invalid Collection Frequency "..."` 会列出当前无效值及所有允许值，不再只返回笼统错误。
- 打开另一间 Branch 时，前一间的 draft、dirty/validation state 与异步响应不会复用。
- 成功与失败提示互斥；保存失败不会关闭 Modal，保存成功不会残留旧错误。

### 测试方法

```bash
node --test test/branchEditorContinuous.test.mjs test/customerPricingV19.test.mjs
npm run lint
npm run build
npm test
```

连续编辑测试在同一会话模型中建立并编辑10间不同 Branch，交替使用 Standard/Outstation，覆盖已设置、未设置及旧版无效 Frequency，逐间保存重开后核对 Material、类型、实际价格、Frequency 与 Weekdays。完整测试不读取或修改 AWS 数据库。
