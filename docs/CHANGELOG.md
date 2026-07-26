# KCS Change Log

## Customer Branch consecutive-edit and resolved-price fix

- Customer and Branch pricing selectors display the selected Standard, Outstation or Customer Special Price in RM/kg immediately.
- Branch details are fetched by BranchID on every open; request sequencing and BranchID component keys prevent stale or mixed form state.
- A successful save closes the modal and refreshes the list. A failed save keeps the modal open, and success/error messages are mutually exclusive.
- Frontend and backend now share Collection Frequency and weekday normalization. Blank and untouched legacy values no longer block price-only edits; invalid values return a field-specific message.
- Added a 10-Branch continuous-session regression covering alternating Standard/Outstation prices, configured/unconfigured/legacy Frequency values, saved data and reopen verification.
- Schema remains v19. No AWS deployment or production-data change was performed.

## Application-controlled multilingual form validation

- 登录、首次改密、普通改密、账号建立和账号重设密码改用 KCS 字段级验证，不再触发浏览器原生 `required` / `minLength` 气泡。
- 必填提示严格按账号当前界面语言显示：BM `Sila isi ruangan ini.`、中文 `请填写此字段。`、English `Please fill in this field.`。
- 密码不足 8 位、确认密码不一致也使用当前语言；用户输入后只清除对应字段错误。
- 手机临时客户和桌面临时收货请求沿用相同验证组件。
- 错误字段提供 `aria-invalid`、`aria-describedby`、`aria-required`，错误文字使用 `role="alert"`。
- 沿用 SQLite schema v17，没有 migration，也没有部署 AWS。

## Account/Profile language selector

- 登录页保留 Bahasa Melayu、中文和 English，并即时切换。
- 成功登录时保存账号 `preferred_language`；失败登录不修改偏好。
- 移除桌面及手机顶栏重复语言下拉框。
- Preferred Language 只在 Account/Profile 菜单内调整，选择后即时生效并自动保存。
- Profile 菜单继续显示 Employee Name、Username、Employee Code、System Role、Change Password、按权限显示的 Account Management 与 Logout。
- 沿用 SQLite schema v17，没有新增 migration，也没有部署 AWS。
- 自动测试覆盖登录保存、下次登录恢复、单一 Profile 语言入口及响应式限制；另以 390×844 浏览器 viewport 验证手机页面。
