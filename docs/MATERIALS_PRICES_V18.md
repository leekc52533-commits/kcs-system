# Materials, Branch Price List & Collection Rules — Schema v18

## 目的与兼容原则

v18 把 Customer Branch 的单一 OCC 价格扩展为通用 Branch Price List。现有 Customer、Branch、GPS、Schedule、Vehicle、Account 与历史派车资料不会删除或重建。`branches.occ_price` 与 `customers.occ_price` 暂时保留作旧系统兼容，但正常 Customer Branch 页面不再提供 OCC Price 输入框。

正式地址、道路、城市、州、基地与 Operational Location 名称继续保存原始 English 或 Bahasa Melayu；界面语言不会改写地点资料。

## 数据库变更

新增表：

- `materials`
- `material_price_levels`
- `branch_material_prices`
- `material_price_history`
- `branch_material_price_history`
- `dispatch_stop_material_prices`

迁移会建立 OCC、Bristol Paper、Aluminum Can、Plastic、Iron。所有现有非空 OCC 价格按“相同价格共用同一 Price Level”转换，旧生效日期固定为 `2000-01-01` 以明确表示历史导入。唯一键及 `INSERT OR IGNORE` 确保重复执行不会重复建立 Material、Price Level 或 Branch assignment。

`dispatch_stop_material_prices` 保存成交/派车站点当时的 Material、单位、价格来源、Price Level 与价格快照。以后开单模块必须从 Branch Price List 选择货物，并在交易确认时调用快照逻辑；已完成单据只读快照，不回读当前 Price Level。

## 管理员操作

### 建立或编辑 Customer Branch

1. 进入 `Customer & Locations` → `Branch`。
2. 建立或打开 Branch。
3. 在 `Materials & Current Prices` 按“加入 Material”。
4. 每个 Material 选择现有 Price Level，或勾选 `Special Price` 输入该分店个别价格。
5. 同一 Branch 不可重复选择相同 Material。
6. 选择 Collection Frequency；Assigned Weekdays 可暂时留空。
7. 保存并重新打开确认资料。

### 管理 Material 与 Price Level

1. 进入 `Materials & Prices`。
2. 第一层选择 Material，第二层才显示该 Material 的 Price Levels。
3. 新增 Price Level 时填写价格、生效日期和原因。
4. 批量调价会先显示受影响 Branch 数量，必须再次确认。
5. 停用 Price Level 不会删除历史，也不会改写交易快照。

权限：`owner_admin`、`operations_admin` 或明确获授 `price_manage` 的 Supervisor 可管理价格。其他员工只可查看。所有写入接口均由服务端再次验证权限。

## Collection Frequency

允许值：Once a week、Twice a week、3 times a week、4 times a week、Daily、On Call、Paused。

- 固定次数与星期数量不一致时显示警告，但允许先只保存次数。
- `Thurday` 会标准化为 `Thursday`。
- `On Call` 与 `Paused` 自动清除 Assigned Weekdays。
- `On Call` 不进入固定周路线；来电后使用现有 `Special Collection Requests / Request Collection` 流程。
- `Paused` 不进入自动生成路线。

## 测试方法

```bash
npm ci
npm run lint
npm run build
npm test
```

v18 专项：

```bash
node --test test/materialsPricesV18.test.mjs
```

覆盖 v17→v18、OCC 共用 Price Level、幂等迁移、多 Material、重开保留、重复 Material 阻止、Special Price、批量调价、价格快照、Frequency、On Call/Paused、权限、菜单与侧栏。

## AWS 部署（得到主管确认后才执行）

正式库固定为 `/var/lib/kcs/data/kcs-dispatch.db`，不得上传或复制开发电脑 SQLite 覆盖。

```bash
cd /opt/kcs-app
sudo systemctl stop kcs-api
export KCS_DB_PATH=/var/lib/kcs/data/kcs-dispatch.db
export KCS_BACKUP_DIR=/var/lib/kcs/data/backups

sqlite3 "$KCS_DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta; SELECT COUNT(*) FROM customers; SELECT COUNT(*) FROM branches; SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM auth_accounts;"
sqlite3 "$KCS_DB_PATH" "SELECT e.employee_code,e.name,a.username,a.role,a.is_active FROM employees e LEFT JOIN auth_accounts a ON a.employee_id=e.id WHERE replace(upper(e.employee_code),'-','')='EMP0003' OR lower(a.username)='kcadmin';"

npm run predeploy:kcs
git pull --ff-only origin main
npm ci
npm run migrate:v18
npm run lint
npm run build
npm test
sudo systemctl start kcs-api
sudo systemctl status kcs-api --no-pager
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS https://dispatch.leesaiker.com/api/health
sqlite3 "$KCS_DB_PATH" "PRAGMA integrity_check; SELECT MAX(version) FROM schema_meta; SELECT COUNT(*) FROM customers; SELECT COUNT(*) FROM branches; SELECT COUNT(*) FROM employees; SELECT COUNT(*) FROM auth_accounts; SELECT COUNT(*) FROM branch_material_prices;"
```

只有 Caddy 配置实际改变时才执行 `sudo systemctl reload caddy`。部署后需人工验证 kcadmin、EMP0003、登录、权限、Customer Branch、GPS、排程与价格页面。

## 回滚

使用 `predeploy:kcs` 输出的实际备份文件名：

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

回滚前 API 必须停止。脚本会先为当前库再建立一份 safety backup，并拒绝有未处理 WAL 的危险恢复。

## 权限、安全与备份

- Excel、SQLite、客户资料、照片、`.env`、API Key 与 Token 不提交 Git。
- `data/` 与 `uploads/` 继续由 `.gitignore` 排除。
- 调价记录保存旧价、新价、旧/新生效日期、影响 Branch 数、原因、操作人及时间。
- Special Price 的建立/更换/移除保存 Branch 级历史。
- 部署前必须停止 API、checkpoint WAL、执行 `VACUUM INTO` 备份及两次 integrity check。

## 后续开单模块

开单画面应读取 `branch_material_prices` JOIN `materials` / `material_price_levels`，让司机选择实际货物与数量。确认单据时写入不可变 transaction line price snapshot；不要仅存 Price Level ID，也不要在历史单据显示时重新计算当前价格。
