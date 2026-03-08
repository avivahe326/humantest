# human_test()

Real human usability testing for AI-built products. Let AI hire humans to test your product and get structured, agent-parseable feedback reports.

## What it does

1. You call `human_test()` with a product URL or description (via the web form, API, or AI agent skill)
2. AI auto-generates a structured test plan
3. Real human testers claim the task and provide guided feedback — first impression, task steps, NPS rating, screen recording with audio narration
4. AI extracts key frames from each recording (via ffmpeg) and uses the configured AI provider's vision capability to analyze usability issues, then aggregates all feedback into a structured report with severity-ranked findings
5. (Optional) If you provide a repo URL, the platform clones your code, generates file-level fix suggestions, and can auto-create a PR

URL is optional — you can also test mobile apps, desktop software, or anything with a description.

### Two-stage workflow

Report generation and code fix are separate stages:
1. **Generate Report** — AI extracts key frames from recordings, analyzes them with vision AI, then aggregates all tester feedback into a structured usability report
2. **Generate Code Fix PR** — AI clones your repo, analyzes code against report issues, and creates a PR (requires `repoUrl`)

Each stage has its own webhook: `webhookUrl` fires after the report, `codeFixWebhookUrl` fires after the code fix.

### Screen recording & media analysis

Testers record their screen and microphone directly in the browser (up to 15 minutes). Recordings are uploaded to local disk or Alibaba Cloud OSS. The platform then:

1. **Phase 1** — Extracts key frames from each recording (every 3 seconds via ffmpeg), then uses the configured AI provider's vision capability to analyze each tester's session (identifies usability issues, confusion points, navigation patterns)
2. **Phase 2** — Aggregates all individual analyses + text feedback into a structured report via the same AI provider

If a tester's recording fails or is skipped, their text feedback is still included in the report.

### Internationalization

The platform supports English and Chinese. Language is auto-detected from the browser's `Accept-Language` header and can be toggled in the UI. Reports are generated in the language matching the task's locale.

## Quick Start

```bash
npm i -g humantest-app
humantest init
cd humantest
humantest start
```

The interactive setup wizard will guide you through configuration:

- **Local mode**: SQLite database, zero config — great for dev/small teams
- **Cloud mode**: MySQL database — for production deployments

The wizard prompts for: database, AI provider, port, domain (cloud), SMTP, recording storage (OSS or local disk), and GitHub token.

### Non-interactive setup

For automated/agent-driven installs, use `--non-interactive`:

```bash
humantest init --non-interactive
```

This uses local mode (SQLite), auto-detects AI API keys from environment variables (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `DEEPSEEK_API_KEY`, or `GEMINI_API_KEY`), and runs on port 3000. A default admin user (`admin@humantest.local` / `admin`) is created automatically.

### Default admin user

Both interactive and non-interactive init create a default admin user:

- **Email**: `admin@humantest.local`
- **Password**: `admin`

This user is used as the fallback when API requests are made without authentication. Change the password after first login in production.

## Manual Setup

```bash
git clone https://github.com/avivahe326/humantest.git
cd humantest
cp .env.example .env
# Edit .env with your settings
npm install
npx prisma db push
npm run build
npm start
```

## Configuration

See [`.env.example`](.env.example) for all available environment variables.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | SQLite (`file:./data/humantest.db`) or MySQL connection string |
| `NEXTAUTH_SECRET` | Yes | Random secret for session encryption |
| `NEXTAUTH_URL` | Yes | App URL (`http://localhost:3000` or `https://your-domain.com`) |
| `AI_PROVIDER` | No | `anthropic` (default) or `openai` |
| `AI_API_KEY` | No | API key for AI report generation |
| `SMTP_HOST` | No | Enable email verification (skip = direct registration) |
| `SMTP_FROM` | No | Email sender address |
| `OSS_REGION` | No | Alibaba Cloud OSS region (skip = store recordings on local disk) |
| `OSS_BUCKET` | No | Alibaba Cloud OSS bucket name |
| `GITHUB_TOKEN` | No | Enable repo cloning and auto-PR for code fix suggestions |

These can also be configured at runtime through the admin settings page (see below).

## Admin Settings

The first registered user automatically becomes the admin. The admin can configure platform-wide settings from the Settings page (`/settings`):

- **AI provider** — Anthropic, OpenAI, or compatible (custom base URL + model override)
- **SMTP** — host, port, user, password, sender address (enables email verification for registration)
- **Object storage** — Alibaba Cloud OSS region, bucket, role name (otherwise recordings are stored on local disk)
- **GitHub token** — enables repo cloning and auto-PR for code fix suggestions
- **Default task settings** — default max testers and estimated minutes for new tasks
- **Default language** — English or Chinese

## CLI Commands

| Command | Description |
|---------|-------------|
| `humantest init [--non-interactive]` | Setup wizard (`--non-interactive` for auto mode) |
| `humantest start` | Start the server (pm2) |
| `humantest stop` | Stop the server |
| `humantest restart` | Restart the server |
| `humantest update` | Pull latest code, rebuild, and restart |
| `humantest status` | Check server status |
| `humantest logs` | View server logs |
| `humantest uninstall` | Stop server and remove all files |

## Architecture

```
Next.js 16 + Prisma + NextAuth + Tailwind CSS

├── app/                    # Next.js app router pages & API routes
│   ├── api/
│   │   ├── skill/          # AI agent skill API (create task, check status)
│   │   ├── tasks/          # Task CRUD, claim, submit, report generation
│   │   ├── ai/             # AI test plan generation
│   │   ├── auth/           # Registration, login, email verification
│   │   ├── oss/            # Presigned upload URLs (OSS or local)
│   │   ├── recordings/     # Local recording upload & serve
│   │   ├── config/         # Public config endpoint
│   │   └── settings/       # Admin platform settings
│   ├── tasks/              # Task list, detail, testing flow, feedback form
│   ├── my-tasks/           # User's claimed & created tasks
│   ├── settings/           # User API key + admin settings page
│   └── onboarding/         # Post-registration guided onboarding
├── lib/
│   ├── ai-report.ts        # Report generation (two-phase media + text analysis)
│   ├── media-analysis.ts   # Video frame extraction (ffmpeg) and AI vision analysis
│   ├── code-fixer.ts       # Repo-aware code fix suggestions + auto-PR
│   ├── webhook.ts          # Webhook delivery
│   ├── validate.ts         # Zod schemas for input validation
│   ├── rate-limit.ts       # Per-endpoint rate limiting
│   └── i18n/               # English + Chinese translations
├── prisma/
│   └── schema.prisma       # Database schema (MySQL or SQLite)
├── skill/
│   └── SKILL.md            # AI agent skill definition
└── cli/
    └── humantest.mjs       # CLI tool source
```

## AI Agent Integration

human_test() is designed as an AI agent skill. Your AI coding agent can call it to get real human feedback on your product:

```bash
# Install as an agent skill (Claude Code, Cursor, Copilot, etc.)
npx skills add avivahe326/human-test-skill
```

Or call the API directly (no authentication required for self-hosted instances):

```bash
curl -X POST http://localhost:3000/api/skill/human-test \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "Test the onboarding flow",
    "maxTesters": 5,
    "repoUrl": "https://github.com/you/repo",
    "webhookUrl": "https://your-server.com/webhook",
    "codeFixWebhookUrl": "https://your-server.com/code-fix-webhook"
  }'
```

## Report Format

Reports are structured for AI agents to parse and act on:

```markdown
## Issues
### [CRITICAL] Issue title
- **Evidence:** what was observed and by whom
- **Impact:** how it affects users
- **Recommendation:** specific fix

## Recommendations
- **P0** (fix immediately): ...
- **P1** (fix this sprint): ...
```

## Code Fix Suggestions

Pass a `repoUrl` when creating a task to get code-level fix suggestions:

- **Mode 1 (Read-only)**: Grant the platform's GitHub account read access → get file-level fix suggestions in the report
- **Mode 2 (Write access)**: Grant write access → get an auto-created PR with the fixes

Code fix generation is triggered automatically when a report completes (if `repoUrl` is set), or manually from the task detail page.

## Rate Limiting

API endpoints are rate-limited per user/IP:

| Endpoint | Limit |
|----------|-------|
| Registration | 5 req/min per IP |
| Email verification code | 3 req/min per IP, 1 req/min per email |
| Task creation | 10 req/min per user |
| Skill API | 30 req/min per user |
| Recording presign | 10 req/min per user |

## Cloud Service

Don't want to self-host? Use the hosted version at **[human-test.work](https://human-test.work)** — same platform, zero setup.

## License

MIT
