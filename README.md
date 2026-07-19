# KCS Dispatch System

KCS 司机派送与回收作业系统。当前版本包含司机顺序流程、Jodoo Excel 正式导入、SQLite 客户/分店/排程/GPS 主档、资料质量页面，以及 Jodoo（简道云）连接的后台骨架。

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

SQLite schema 目前为 v5。`branches` 保留现有架构，同时保存原始 CustomerID/AreaID，方便显示未匹配关联并保证重复导入幂等。Route Ready 规则集中在 `shared/importRules.js`：至少一条有效排程、有效经纬度，并且客户/分店状态不是 Paused、Closed 或 Ended；当前没有来源状态时视为 Active。

## 项目结构

```text
src/       React 前端页面与司机工作流程
server/    Node.js API、SQLite 数据库与 Jodoo 连接层
scripts/   本地开发启动脚本
docs/      设置与对接说明
public/    网站公开静态资源
```

运行期间产生的数据保存在本机 `data/` 目录，不进入公开仓库。`.gitignore` 也排除 `uploads/`、`*.sqlite`、`*.sqlite3`、`.env` 和 `01_Source_Data/`。生产使用前应配置备份、访问控制、HTTPS，并完成 Jodoo 测试环境的端到端验证。

2026-07-19 本机五份来源文件首次实际导入结果：1,216 行；新增 1,099、更新 0、没有变化 115、无法匹配排程 2。导入后共有 253 个客户、475 间分店、276 条排程（其中 2 条 BranchID 未匹配）、118 间有效 GPS、106 间 Route Ready。再次导入相同五份文件时新增 0、更新 0、没有变化 1,214、无法匹配 2，验证没有产生重复主档。
