# human_test()

Real human usability testing for AI-built products. Let AI hire humans to test your product and get structured, agent-parseable feedback reports.

## What it does

1. You call `human_test()` with a product URL (via API, AI agent skill, or web form)
2. AI auto-generates a structured test plan
3. Real human testers claim the task and provide guided feedback (first impression, task steps, NPS rating, screen recording, audio narration)
4. AI aggregates all feedback into a structured report with severity-ranked findings
5. (Optional) If you provide a repo URL, the platform generates code-level fix suggestions and can auto-create a PR

## Quick Start

```bash
npm i -g humantest
humantest init
humantest start
```

The interactive setup wizard will guide you through configuration:

- **Local mode**: SQLite database, zero config — great for dev/small teams
- **Cloud mode**: MySQL database — for production deployments

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
| `ANTHROPIC_API_KEY` | Yes | For AI report generation |
| `SMTP_HOST` | No | Enable email verification (skip = direct registration) |
| `GITHUB_TOKEN` | No | Enable repo cloning and auto-PR for code fix suggestions |

## Architecture

```
Next.js 15 + Prisma + NextAuth + Tailwind CSS

├── app/                    # Next.js app router pages & API routes
│   ├── api/
│   │   ├── skill/          # AI agent skill API (create task, check status)
│   │   ├── tasks/          # Task CRUD, claim, submit, report generation
│   │   └── auth/           # Registration, login, email verification
│   ├── tasks/              # Task list, detail, testing flow, feedback form
│   └── (auth)/             # Login, register pages
├── lib/
│   ├── ai-report.ts        # Report generation (Claude + Gemini media analysis)
│   ├── code-fixer.ts       # Repo-aware code fix suggestions + auto-PR
│   ├── gemini.ts           # Video/audio frame extraction and analysis
│   ├── webhook.ts          # Webhook delivery
│   └── i18n/               # English + Chinese translations
├── prisma/
│   └── schema.prisma       # Database schema (MySQL or SQLite)
└── skill/
    └── SKILL.md            # AI agent skill definition
```

## AI Agent Integration

human_test() is designed as an AI agent skill. Your AI coding agent can call it to get real human feedback on your product:

```bash
# Install as an agent skill (Claude Code, Cursor, Copilot, etc.)
npx skills add avivahe326/human-test-skill
```

Or call the API directly:

```bash
curl -X POST http://localhost:3000/api/skill/human-test \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "Test the onboarding flow",
    "maxTesters": 5,
    "repoUrl": "https://github.com/you/repo",
    "webhookUrl": "https://your-server.com/webhook"
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

- **Mode 1 (Read-only)**: Grant the platform's GitHub account read access → get file-level diffs appended to the report
- **Mode 2 (Write access)**: Grant write access → get an auto-created PR with the fixes

## Cloud Service

Don't want to self-host? Use the hosted version at **[human-test.work](https://human-test.work)** — same platform, zero setup.

## License

MIT
