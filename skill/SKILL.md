---
name: human_test
slug: human-test
description: "Call real humans to test your product. Get structured usability feedback with NPS scores, step-by-step task reports, and AI-aggregated findings."
summary: "human_test() — hire real humans to test any URL. Returns an AI-generated usability report with NPS analysis and actionable recommendations."
tags:
  - testing
  - usability
  - feedback
  - ux-research
  - human-in-the-loop
version: 1.0.0
---

# human_test() — Real Human Feedback for AI Products

AI agents cannot judge human perception, emotion, or usability. This skill lets you call real humans to test any product URL and get structured feedback back.

## What it does

1. You call `human_test()` with a product URL
2. AI auto-generates a structured test plan
3. Real human testers claim the task on the web platform
4. Each tester completes a 3-step guided feedback flow (first impression, task steps, NPS rating)
5. AI aggregates all feedback into a structured report with severity-ranked findings

## Quick start

You need an API key. Register at https://human-test.work/register to get one (free).

### Create a test task

```bash
curl -X POST https://human-test.work/api/skill/human-test \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "Test the onboarding flow",
    "maxTesters": 5
  }'
```

Response:
```json
{
  "taskId": "cm...",
  "status": "OPEN",
  "testPlan": { "steps": [...], "nps": true, "estimatedMinutes": 10 }
}
```

### Check progress and get the report

```bash
curl https://human-test.work/api/skill/status/<taskId> \
  -H "Authorization: Bearer <your-api-key>"
```

Response (when completed):
```json
{
  "taskId": "cm...",
  "status": "COMPLETED",
  "submittedCount": 5,
  "report": "## Executive Summary\n..."
}
```

## Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `url` | Yes | — | Product URL to test |
| `title` | No | Auto from hostname | Task title |
| `focus` | No | — | What testers should focus on |
| `maxTesters` | No | 5 | Number of testers (1-50) |
| `estimatedMinutes` | No | 10 | Expected test duration |
| `webhookUrl` | No | — | HTTPS URL to receive the report on completion |
| `repoUrl` | No | — | GitHub/Gitee repo URL for code-level fix suggestions |
| `repoBranch` | No | repo default | Branch to analyze (only used with repoUrl) |

## Async webhook

If you provide a `webhookUrl`, the platform will POST the full report to that URL when all testers have submitted:

```json
{
  "taskId": "...",
  "status": "COMPLETED",
  "title": "Test: example.com",
  "targetUrl": "https://example.com",
  "report": "## Executive Summary\n...",
  "codeFixPrUrl": "https://github.com/user/repo/pull/1",
  "completedAt": "2026-03-02T12:00:00Z"
}
```

## Report format (structured for AI agents)

The report is returned as a markdown string in the `report` field. It uses a **consistent, machine-parseable structure** designed for AI agents to read and act on directly — for example, to automatically file issues, create PRs, or prioritize a fix backlog.

### Section structure

Every report contains these exact sections in order:

```markdown
## Metadata
| Field | Value |
|-------|-------|
| Product | ... |
| URL | ... |
| Testers | N |
| Avg NPS | X.X/10 |

## Executive Summary
(3-5 sentences, most critical finding first)

## Issues
### [CRITICAL] Issue title
- **Evidence:** (specific testers and observations)
- **Impact:** (effect on users)
- **Recommendation:** (actionable fix)

### [MAJOR] Issue title
- **Evidence:** ...
- **Impact:** ...
- **Recommendation:** ...

### [MINOR] Issue title
...

## Positive Highlights
(What worked well)

## NPS Analysis
(Score breakdown, interpretation)

## Recommendations
- **P0** (fix immediately): ... (references issue)
- **P1** (fix this sprint): ...
- **P2** (next sprint): ...
- **P3** (backlog): ...
```

### Parsing tips for agents

- **Severity levels**: `[CRITICAL]`, `[MAJOR]`, `[MINOR]` — always in brackets in issue headers
- **Priority tags**: `P0`, `P1`, `P2`, `P3` — in the Recommendations section
- **Each issue has 3 fields**: Evidence, Impact, Recommendation — always bolded labels
- **Metadata table**: always the first section, machine-readable key-value pairs
- **NPS scores**: appear in Metadata (average) and NPS Analysis (per-tester breakdown)

## Agent auto-fix workflow

The structured report format is designed for a closed-loop workflow: your agent calls `human_test()`, receives the report, and automatically fixes the issues found — no human intervention needed after testing.

### Recommended flow

1. Call `human_test()` with your product URL (include `webhookUrl` to get notified)
2. Wait for the report (poll `/api/skill/status/<taskId>` or receive webhook)
3. Parse the `## Issues` section — each issue has `[SEVERITY]`, Evidence, Impact, and Recommendation
4. For `[CRITICAL]` and `[MAJOR]` issues, use the **Recommendation** field to generate targeted code fixes
5. Create commits or PRs for each fix
6. (Optional) Call `human_test()` again to verify the fixes

Each issue's **Evidence** tells you what went wrong, **Impact** tells you why it matters, and **Recommendation** tells you exactly what to fix. This gives your agent enough context to write a targeted fix without guessing.

## Repo-aware code fix suggestions

If you pass a `repoUrl`, the platform will clone your repo after the report is generated and produce **file-level code fix suggestions** (with unified diffs) appended to the report as a `## Code Fix Suggestions` section.

### Two modes (auto-detected)

**Mode 1 — Read-only:** Grant GitHub user `avivahe326` read access to your repo. After the report, the platform clones the repo, analyzes the code against reported issues, and appends code-level diffs to the report.

**Mode 2 — Developer access:** Grant `avivahe326` write access. Same as Mode 1, plus: creates a branch `human-test/fixes-<taskId>`, applies the diffs, pushes, and opens a PR. The PR URL is returned in the webhook payload as `codeFixPrUrl` and in the status API.

### Example with repoUrl

```bash
curl -X POST https://human-test.work/api/skill/human-test \
  -H "Authorization: Bearer <your-api-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://your-product.com",
    "focus": "Test the checkout flow",
    "repoUrl": "https://github.com/your-org/your-repo",
    "repoBranch": "main",
    "webhookUrl": "https://your-server.com/webhook"
  }'
```

## Links

- Web platform: https://human-test.work
- API docs: https://human-test.work/settings (after login, shows curl examples)
