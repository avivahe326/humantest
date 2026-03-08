# human_test()

[English](README.md) | **中文**

[![npm version](https://img.shields.io/npm/v/humantest-app?color=cb3837)](https://www.npmjs.com/package/humantest-app)
[![npm downloads](https://img.shields.io/npm/dm/humantest-app?color=cb3837)](https://www.npmjs.com/package/humantest-app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%E2%89%A518-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/avivahe326/humantest/pulls)
[![Skill](https://img.shields.io/badge/AI%20Skill-human__test()-8A2BE2)](https://github.com/avivahe326/human-test-skill)

AI 几分钟就能写完代码，但真实用户到底能不能用？

**human_test()** 补上最后一环 — 你的 AI agent 调用真人来测试产品，拿到结构化的可用性报告，然后自动修复问题。不需要手动 QA，不需要靠猜。

```
你：  "测试我 localhost:3000 上的应用，重点看注册流程"
Agent: → 调用 human_test()
       → 5 个真人测试你的产品（屏幕录制 + 语音旁白）
       → AI 分析录屏并生成结构化报告
       → 发现 3 个严重问题，自动生成修复代码，创建 PR #42
```

![示例报告](docs/images/report-screenshot.png)

## 快速开始

```bash
npm i -g humantest-app
humantest init
cd humantest
humantest start
```

三条命令搞定。本地 SQLite 数据库，零外部依赖。打开 `http://localhost:3000` 创建你的第一个测试任务。

或者直接使用托管版本，免安装 — **[human-test.work](https://human-test.work)**。

## AI Agent 集成

human_test() 是一个 **AI agent 原语** — 不是给人看的仪表盘，而是 agent 可以直接调用、解析、执行的结构化 API。

### 安装为 agent skill

```bash
# 支持 Claude Code、Cursor、Windsurf 等
npx skills add avivahe326/human-test-skill
```

安装后，你的 agent 可以用自然语言调用 `human_test()`：

> "对我的结账流程做一次可用性测试，3 个测试员"

### 或直接调用 API

```bash
curl -X POST http://localhost:3000/api/skill/human-test \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "测试注册流程",
    "maxTesters": 5
  }'
```

自托管实例无需认证即可调用。

## 工作流程

1. **创建任务** — 提供 URL（或移动端/桌面应用的描述）和测试重点
2. **真人测试** — 测试员领取任务，录制屏幕 + 麦克风，完成引导式反馈流程（第一印象、任务步骤、NPS 评分）
3. **AI 生成报告** — 从录屏中提取关键帧，用视觉 AI 分析可用性问题，汇总所有反馈生成结构化的、按严重程度排序的报告
4. **自动修复（可选）** — 如果提供了 `repoUrl`，平台会克隆你的代码，生成文件级修复建议，并创建 PR

![任务面板](docs/images/workflow.png)

## 自动修复：从报告到 PR

这是 human_test() 区别于传统 UX 测试工具的闭环能力：

```
human_test() → 真人测试 → 结构化报告
    → AI 解读报告问题 → 克隆你的仓库
    → 生成文件级 diff → 创建 PR
```

创建任务时传入 `repoUrl`：

```bash
curl -X POST http://localhost:3000/api/skill/human-test \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "测试结账流程",
    "repoUrl": "https://github.com/your-org/your-repo",
    "webhookUrl": "https://your-server.com/webhook",
    "codeFixWebhookUrl": "https://your-server.com/code-fix-webhook"
  }'
```

**两种模式**（根据 GitHub 权限自动检测）：
- **只读权限** — 在报告中以 diff 形式展示修复建议
- **写入权限** — 自动创建包含修复代码的 PR

![代码修复建议](docs/images/auto-pr-screenshot.png)

## 为什么不用 UserTesting / Maze？

传统 UX 测试平台是为产品经理看仪表盘设计的。human_test() 是为**写代码的 AI agent** 设计的：

- **结构化输出** — 按严重程度排序的问题，包含证据/影响/建议，agent 可直接解析和执行
- **Webhook 驱动** — 报告和代码修复完成时异步通知
- **自动 PR** — 从可用性问题到 Pull Request，中间不需要人工介入
- **可自托管** — 本地 SQLite 运行，数据留在你的机器上
- **开源** — MIT 协议，随意扩展

## 报告格式

报告是结构化 markdown，专为 AI agent 直接解析设计：

```markdown
## 元数据
| 字段 | 值 |
|------|-----|
| 产品 | Your App |
| 测试员 | 5 |
| 平均 NPS | 7.2/10 |

## 执行摘要
（3-5 句话，最关键的发现排在最前）

## 问题
### [严重] 移动端注册按钮无响应
- **证据：** 5 名测试员中有 3 名无法在 iPhone 上完成注册
- **影响：** 60% 的移动端用户会放弃注册
- **建议：** 修复触摸目标尺寸，最小 44x44px

### [重要] 定价页面布局混乱
...

## 建议
- **P0**（立即修复）：移动端注册按钮
- **P1**（本迭代修复）：定价页面清晰度
- **P2**（下个迭代）：...
```

严重程度：`[严重]`、`[重要]`、`[轻微]`。优先级：`P0`–`P3`。每个问题包含三个字段：证据、影响、建议 — 为你的 agent 提供足够的上下文来编写针对性修复。

## 参数

| 参数 | 必填 | 默认值 | 说明 |
|------|------|--------|------|
| `url` | 否 | — | 产品 URL（移动应用或非 Web 产品可留空） |
| `focus` | 否 | — | 测试员应关注的重点 |
| `maxTesters` | 否 | 5 | 测试员数量（1–50） |
| `repoUrl` | 否 | — | GitHub 仓库 URL，用于自动修复和创建 PR |
| `repoBranch` | 否 | 默认分支 | 要分析的分支 |
| `webhookUrl` | 否 | — | 报告完成时的回调 URL |
| `codeFixWebhookUrl` | 否 | — | 代码修复完成时的回调 URL |
| `creator` | 否 | admin | 创建任务的 agent/用户名称 |
| `locale` | 否 | `en` | 报告语言：`en`（英文）或 `zh`（中文） |

## CLI 命令

| 命令 | 说明 |
|------|------|
| `humantest init` | 安装向导（加 `--non-interactive` 自动模式） |
| `humantest start` | 启动服务 |
| `humantest stop` | 停止服务 |
| `humantest restart` | 重启服务 |
| `humantest update` | 拉取最新代码、重新构建、重启 |
| `humantest status` | 查看服务状态 |
| `humantest logs` | 查看服务日志 |

<details>
<summary><strong>配置</strong></summary>

所有可用变量见 [`.env.example`](.env.example)。

| 变量 | 必填 | 说明 |
|------|------|------|
| `DATABASE_URL` | 是 | SQLite（`file:./data/humantest.db`）或 MySQL 连接字符串 |
| `NEXTAUTH_SECRET` | 是 | 会话加密随机密钥 |
| `NEXTAUTH_URL` | 是 | 应用 URL（`http://localhost:3000` 或你的域名） |
| `AI_PROVIDER` | 否 | `anthropic`（默认）或 `openai` |
| `AI_API_KEY` | 否 | AI 报告生成的 API 密钥 |
| `SMTP_HOST` | 否 | 启用邮箱验证（不填则直接注册） |
| `OSS_REGION` | 否 | 对象存储区域（不填则录屏存本地磁盘） |
| `GITHUB_TOKEN` | 否 | 启用仓库克隆和自动 PR |

第一个注册的用户自动成为管理员，可在 `/settings` 页面修改所有配置。

### 非交互式安装

用于自动化/CI 安装：

```bash
humantest init --non-interactive
```

使用本地模式（SQLite），自动检测环境中的 AI 密钥（`ANTHROPIC_API_KEY`、`OPENAI_API_KEY`、`DEEPSEEK_API_KEY` 或 `GEMINI_API_KEY`），端口 3000。自动创建默认管理员用户（`admin@humantest.local` / `admin`）。

</details>

<details>
<summary><strong>Webhooks</strong></summary>

两个阶段分别有独立的 webhook：

### 报告 webhook（`webhookUrl`）

```json
{
  "event": "report",
  "taskId": "...",
  "status": "COMPLETED",
  "report": "## 执行摘要\n..."
}
```

### 代码修复 webhook（`codeFixWebhookUrl`）

```json
{
  "event": "code_fix",
  "taskId": "...",
  "status": "COMPLETED",
  "codeFixPrUrl": "https://github.com/user/repo/pull/1"
}
```

</details>

<details>
<summary><strong>架构</strong></summary>

```
Next.js 16 + Prisma + NextAuth + Tailwind CSS

├── app/                    # App Router 页面和 API 路由
│   ├── api/
│   │   ├── skill/          # AI agent skill API
│   │   ├── tasks/          # 任务增删改查、领取、提交、报告生成
│   │   ├── auth/           # 注册、登录、邮箱验证
│   │   └── settings/       # 管理员平台设置
│   ├── tasks/              # 任务列表、详情、测试流程
│   └── settings/           # 管理员设置页
├── lib/
│   ├── ai-report.ts        # 两阶段媒体 + 文本分析
│   ├── media-analysis.ts   # 视频帧提取 + AI 视觉分析
│   ├── code-fixer.ts       # 仓库感知代码修复 + 自动 PR
│   └── i18n/               # 英文 + 中文
├── prisma/schema.prisma    # 数据库模型（MySQL 或 SQLite）
├── skill/SKILL.md          # AI agent skill 定义
└── cli/humantest.mjs       # CLI 工具源码
```

</details>

<details>
<summary><strong>速率限制</strong></summary>

| 接口 | 限制 |
|------|------|
| 注册 | 每 IP 5 次/分钟 |
| 邮箱验证 | 每 IP 3 次/分钟 |
| 创建任务 | 每用户 10 次/分钟 |
| Skill API | 每用户 30 次/分钟 |

</details>

## 手动安装

如果不想用 CLI：

```bash
git clone https://github.com/avivahe326/humantest.git
cd humantest
cp .env.example .env    # 编辑你的配置
npm install
npx prisma db push
npm run build
npm start
```

## 许可证

MIT
