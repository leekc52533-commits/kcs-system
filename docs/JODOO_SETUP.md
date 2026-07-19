# KCS 与 Jodoo 正式连接清单

## 需要从 Jodoo 确认的资料

1. 在「Open Platform > API Key」建立一把只供 KCS 使用的 API Key。
2. API Key 的 App 范围只选择公司实际收货／交易 App。
3. API 范围至少包含资料查询、单笔资料更新和文件上传。
4. 复制 App ID 与收货／交易表单的 Entry ID。
5. 为下列字段设置清楚的字段别名，或记录原始字段 ID：
   - Branch ID
   - 重量
   - Invoice 编号
   - 单据照片
   - 现场照片
   - 付款证明
   - 无收货状态
   - 无收货原因
   - 无收货证据
6. 复制司机开单使用的直接表单链接。

## Webhook 设置

在收货／交易表单的「Extension > Webhook」建立资料 Webhook：

- 推送事件：资料新增、资料更新。
- 目标地址：正式部署后 KCS 提供的 HTTPS 地址，加上 `/api/integrations/jodoo/webhook`。
- 另外生成一段只供 Webhook 使用的随机 Token，配置在 KCS 与 Webhook 地址中。
- 正式 Webhook 不能使用 `127.0.0.1` 或公司电脑的本机地址，必须是 Jodoo 能访问的 HTTPS 地址。

## KCS 本地配置

复制 `.env.example` 为 `.env`，在 `.env` 填写对应值。API Key 与 Webhook Token 不得填进任何 `VITE_` 开头的变量，也不要提交到源代码版本记录。

## 上线前验证顺序

1. 用一笔测试顾客资料从 Jodoo 开单。
2. 确认 KCS 只接收一次相同 Webhook。
3. 确认重量、Invoice 与 Branch ID 映射正确。
4. 在 KCS 上传测试照片，司机立即可以继续下一家。
5. 确认后台稍后把照片写回正确的 Jodoo 记录与正确字段。
6. 模拟断网后恢复，确认后台队列会重试而不会重复上传。
