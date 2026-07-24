# KCS Change Log

## Account/Profile language selector

- 登录页保留 Bahasa Melayu、中文和 English，并即时切换。
- 成功登录时保存账号 `preferred_language`；失败登录不修改偏好。
- 移除桌面及手机顶栏重复语言下拉框。
- Preferred Language 只在 Account/Profile 菜单内调整，选择后即时生效并自动保存。
- Profile 菜单继续显示 Employee Name、Username、Employee Code、System Role、Change Password、按权限显示的 Account Management 与 Logout。
- 沿用 SQLite schema v17，没有新增 migration，也没有部署 AWS。
- 自动测试覆盖登录保存、下次登录恢复、单一 Profile 语言入口及响应式限制；另以 390×844 浏览器 viewport 验证手机页面。
