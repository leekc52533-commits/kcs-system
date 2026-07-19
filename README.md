# KCS Dispatch System

KCS 司机派送与回收作业系统。当前版本包含司机顺序流程、客户/路线资料导入、GPS 到达验证、异常回访、照片凭证，以及 Jodoo（简道云）连接的后台骨架。

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
npm run preview   # 预览正式构建
```

## 项目结构

```text
src/       React 前端页面与司机工作流程
server/    Node.js API、SQLite 数据库与 Jodoo 连接层
scripts/   本地开发启动脚本
docs/      设置与对接说明
public/    网站公开静态资源
```

运行期间产生的数据保存在本机 `data/` 目录，不进入公开仓库。生产使用前应配置备份、访问控制、HTTPS，并完成 Jodoo 测试环境的端到端验证。
