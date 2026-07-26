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
