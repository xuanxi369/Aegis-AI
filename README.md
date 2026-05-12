# 🔷 Aegis AI — 企业级 AI 效能中枢

> 基于 Cloudflare 架构的无服务器办公效能平台，面向传统企业文职人员（人事、财务、行政），通过 AI 提升文档处理、报告撰写和数据分析效率。

---

## 🏗 项目架构

```
AI Efficiency/
├── frontend/                    # Vue 3 + Vite + Tailwind CSS 前端
│   ├── index.html               # 入口 HTML
│   ├── package.json             # 依赖配置
│   ├── vite.config.js           # Vite 构建配置
│   ├── tailwind.config.js       # Tailwind 主题（动画+自定义色）
│   ├── postcss.config.js        # PostCSS 配置
│   └── src/
│       ├── main.js              # Vue 入口
│       ├── index.css            # Glassmorphism 全局样式
│       ├── App.vue              # 主应用（完整 UI + 交互逻辑）
│       └── utils/
│           └── api.js           # API 请求封装 + 工具配置
├── worker/                      # Cloudflare Worker 后端
│   ├── wrangler.toml            # Wrangler 部署配置
│   └── src/
│       └── index.js             # Worker 核心中转逻辑
└── README.md
```

## 🚀 快速开始

### 1. 部署 Cloudflare Worker

```bash
cd worker

# 安装 Wrangler CLI（如未安装）
npm install -g wrangler

# 登录 Cloudflare
wrangler login

# 设置密钥（交互式输入，不会明文保存）
wrangler secret put DEEPSEEK_API_KEY     # DeepSeek API 密钥
wrangler secret put GEMINI_API_KEY       # Gemini API 密钥（可选）
wrangler secret put AUTH_TOKEN           # 核心鉴权令牌（前后端必须一致）
wrangler secret put ALLOWED_ORIGIN       # 允许的前端域名
wrangler secret put EXPECTED_CLIENT_ID   # 客户端环境指纹（可选增强）

# 部署 Worker
wrangler deploy
```

### 2. 配置前端并部署

```bash
cd frontend

# 安装依赖
npm install

# ⚠️ 重要：修改 API 配置
# 编辑 src/utils/api.js，填入：
#   WORKER_URL  — 你的 Worker 部署地址
#   AUTH_TOKEN  — 与 Worker 中设置的一致
#   CLIENT_ID   — 与 EXPECTED_CLIENT_ID 一致（若启用）

# 本地开发
npm run dev

# 构建生产版本
npm run build

# 部署到 Cloudflare Pages
npx wrangler pages deploy dist --project-name=aegis-ai
```

## ⚙️ 配置说明

### Worker 环境变量

| 变量 | 类型 | 说明 | 必填 |
|------|------|------|------|
| `MODEL_PROVIDER` | 普通 | AI 引擎选择：`deepseek` 或 `gemini` | 否（默认 deepseek）|
| `DEEPSEEK_API_KEY` | 密钥 | DeepSeek 平台 API 密钥 | 二选一 |
| `GEMINI_API_KEY` | 密钥 | Google Gemini API 密钥 | 二选一 |
| `AUTH_TOKEN` | 密钥 | 核心鉴权令牌 | ✅ 是 |
| `ALLOWED_ORIGIN` | 密钥 | 允许的前端域名 | ✅ 是 |
| `EXPECTED_CLIENT_ID` | 密钥 | 客户端环境指纹令牌 | 否（增强安全）|

### 前端配置 (`src/utils/api.js`)

| 变量 | 说明 |
|------|------|
| `WORKER_URL` | Worker 部署地址 |
| `AUTH_TOKEN` | 与 Worker 的 AUTH_TOKEN 一致 |
| `CLIENT_ID` | 与 Worker 的 EXPECTED_CLIENT_ID 一致（若启用）|

## 🔐 安全设计（护城河策略）

### 逻辑隔离
前端不包含任何 API Key，所有 AI 推理请求必须经过 Cloudflare Worker 中转。

### 环境指纹鉴权（三重验证）
1. **核心令牌验证**：`X-Access-Token` Header 必须匹配
2. **Origin 环境指纹**：请求来源域名必须匹配 `ALLOWED_ORIGIN`
3. **客户端指纹**（可选）：`X-Client-ID` Header 额外验证

### 本地化存储
员工处理的文档数据仅保存在浏览器 LocalStorage 中，不上传任何数据库。

### System Prompt 隐藏注入
复杂的业务逻辑提示词封装在 Worker 中，前端不可见。即便拿到前端代码和 API Key，不知道 System Prompt 的写法也无法复现同等质量的效果。

## 🎨 设计特色

- **Glassmorphism（毛玻璃）** 设计风格
- 渐变配色：蓝色 (#3B82F6) · 粉色 (#EC4899) · 绿色 (#10B981)
- 动态渐变背景 + 浮动光球动画
- 响应式布局（桌面端 + 移动端）
- Toast 通知系统（替代原生 alert）
- 键盘快捷键：`Ctrl+Enter` 提交、`Esc` 关闭工作区
- LocalStorage 历史记录面板

## 📋 核心功能

| 模块 | 功能 | 适用场景 | AI 角色 |
|------|------|----------|---------|
| 📝 智能文书助手 | 输入要点 → 结构化公文 | 周报、计划书、请示报告 | 资深总办秘书 |
| 🔍 合同/文档审核 | 粘贴文本 → 三轮风险扫描 | 合同审核、合规检查 | 合规专家 |
| 🔄 格式化转换器 | 会议纪要 → 标准任务清单 | 会议纪要整理、任务分配 | 数据处理引擎 |

## ⚠️ 注意事项

1. DeepSeek / Gemini API 会产生调用费用，请注意用量控制
2. AUTH_TOKEN 建议使用强随机字符串（如 `openssl rand -hex 32`）
3. 本项目为 MVP 演示版本，生产环境建议增加 Cloudflare Rate Limiting
4. System Prompt 仅存在于 Worker 中，形成技术壁垒
5. 输入内容上限 10000 字符，防止滥用
