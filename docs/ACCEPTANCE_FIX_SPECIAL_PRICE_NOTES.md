# 正式验收修正：Customer Special Price 与 Branch 可清空字段

## 修复范围

本修正以 schema v19 为基础，不新增 migration、不读取或修改 AWS 正式资料，也不改变 Customer、Branch、GPS、Schedule、Vehicle、账号或历史 Dispatch snapshot。

## 原因与代码处理

### Customer Special Price

旧界面在一次 checkbox 事件中连续执行两次基于旧 `form` 的更新：先设置 Special Price，再清除 Price Level。React 合并更新时，第二次旧 state 会覆盖第一次结果，因此金额输入框不会出现。

现在 checkbox 产生一个完整的价格切换 patch，并使用函数式 `setForm(current => ...)` 原子更新对应 Customer、Material 与 Standard/Outstation 项目。其他 Material 不会被修改，切换 Customer 时仍由 Customer ID key 和重新读取的详情建立新 draft。

- 勾选：立即设置 Special Price draft，并清除同一价格类型的共享 Price Level。
- 取消：清除 Special Price，重新显示 Standard/Outstation Price Level 选择。
- 验证：必须为数字、不得小于零、最多三位小数。
- 保存：数据库继续使用 v19 的 Customer Material Pricing 字段；Branch 只保存 Standard/Outstation 类型，并解析 Customer 当前有效价格。

### Branch Notes及同类可选文字字段

前端现在记录用户实际触碰的可选文字字段。未触碰字段不会放进 PATCH payload；用户主动删空的字段会明确发送空字符串。

服务端统一使用字段存在性及 `undefined` 检查：

- 未提交或值为 `undefined`：保留数据库原值。
- 明确提交空字符串或仅空格：写入 `NULL`。
- 明确提交文字：写入去除首尾空白后的值。

相同规则只用于现有允许清空的 Branch 字段：Address、Contact Person、Phone、Collection Time Constraint、Proof Requirements、Vehicle Restriction 和 Notes。没有扩大业务字段范围。

`master_change_history`继续保存修改前后完整快照、操作人、时间和原因，因此 Notes 从文字变为 `NULL` 仍可审计。

## 管理员操作

1. Customer → Customer Material Pricing。
2. 勾选 Customer Special Price 后输入金额；确认摘要显示 `Special Price — RMx.xx/kg`。
3. 如改回共享价格，取消勾选并重新选择 Standard 或 Outstation Price Level。
4. Branch Notes需要清除时，将内容全部删除后保存；重新打开必须保持空白。
5. 保存失败时Modal保留并显示字段错误；成功时Modal关闭并刷新清单。

## 测试

```bash
node --test test/branchEditorContinuous.test.mjs
node --test test/customerPricingV19.test.mjs
node --test test/customerMaster.test.mjs
npm run lint
npm run build
npm test
```

覆盖原子checkbox更新、即时输入框状态、金额验证、保存重开、Special与共享Price Level切换、多Material隔离、Branch Price List、Notes清空、未提交字段保留、审计快照、空白Frequency及连续Branch编辑。

## 部署与回滚

本次只更新应用代码，无数据库migration。获得正式部署批准后：

```bash
cd /opt/kcs-app
sudo systemctl stop kcs-api
export KCS_DB_PATH=/var/lib/kcs/data/kcs-dispatch.db
sqlite3 "$KCS_DB_PATH" "PRAGMA wal_checkpoint(TRUNCATE); PRAGMA integrity_check;"
# 使用 sqlite3 .backup 建立带时间戳备份并验证后：
git pull --ff-only origin main
npm ci
npm run lint
npm run build
npm test
sudo systemctl start kcs-api
curl -fsS http://127.0.0.1:8787/api/health
curl -fsS https://dispatch.leesaiker.com/api/health
```

回滚时停止API、切回部署前Commit、`npm ci && npm run build`，然后启动服务。因为没有migration，正常代码回滚不需要替换数据库；若部署期间发生数据库异常，才使用部署前已验证备份恢复。不得用本机SQLite覆盖AWS。

## 权限、安全与备份影响

- 价格权限仍由服务端 `price_manage`验证。
- 普通员工只能查看解析后的价格。
- 不记录密码、密钥或附件内容。
- 没有新表、新字段或附件。
- 正式部署前仍必须备份SQLite并处理WAL。
- 不执行`npm audit fix`。

## 常见错误

- `Special Price must be a valid number`：输入不是有效数字。
- `Special Price cannot be negative`：价格小于零。
- `Special Price supports up to 3 decimal places`：超过三位小数。
- `Standard/Outstation Price is required`：取消Special Price后尚未选择共享Price Level。
