# Material → Product → Price Group（Schema v22）

## 数据结构

- `materials` 是顶层材料，例如 `Iron`、`Plastic`。
- `material_products` 是可开单产品。`Iron` 旗下的 `G1` 与 `G2` 是两个独立产品，各自拥有自己的固定 Price Group。
- `material_price_levels.product_id` 连接产品，`price_cents` 以整数分进行唯一匹配，避免浮点数比较。
- `branch_product_availability` 只表示产品可选择，不代表已经有价格。
- `customer_product_pricing` 保存非 OCC 的 Customer 当前价格；Standard 与 Outstation 分开。
- `dispatch_stop_material_prices` 增加 Product 名称快照栏位，未来单据保存时使用，既有历史快照不重写。

## 五项基础产品

每次迁移和每次新增 Branch 都会幂等补齐：

1. OCC
2. MIX PLASTIC
3. SALI/TIN
4. G1
5. G2

没有明确价格时仍可选择，但显示 `Price Not Set`。保存账单前必须取得大于 RM0.00 的有效价格；系统不会复制其他 Customer/Branch 的价格。

## 迁移及转换

```powershell
$env:KCS_DB_PATH='C:\explicit\copy.db'
npm run migrate:v22

npm run convert:materials -- --db 'C:\explicit\copy.db' `
  --occ-plan 'C:\explicit\occ-plan.json' `
  --item-master 'C:\explicit\Item_Price.xlsx' `
  --customer-items 'C:\explicit\customer_Item_Price.xlsx'
```

转换器默认 `DRY_RUN`。只有明确加入 `--apply` 才写入；apply 使用单一 transaction。存在未解决的 Legacy Customer/Item 映射时，apply 会停止，不会部分转换。

正式执行必须先停止写入、checkpoint WAL、建立已验证备份，并对正式库和备份运行 `PRAGMA integrity_check`。Price Group 按执行数据库自己的 `Product + price_cents` 查找，不写死 ID。

## Material 问题报告

`GET /api/material-issues` 只读列出 Branch、Material、Product、Full/Short Name、Unit、可选择状态、Standard/Outstation Price Group、当前价格、Price Not Set、Legacy Item 映射、基础产品覆盖、重复关系、重复 Price Group 和错误 Product 连接。

## 历史保护

转换不会删除 Legacy Item、PO、购买、账单、旧价格或 Dispatch snapshot。Full Name、Short Form 与 Unit 只服务当前主档和未来单据；旧单据名称和成交价格保持不变。

