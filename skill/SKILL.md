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

You need an API key. Register at https://human-test.work/register to get one (free, 100 credits on signup).

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
| `rewardPerTester` | No | 20 | Credits per tester |
| `estimatedMinutes` | No | 10 | Expected test duration |
| `webhookUrl` | No | — | HTTPS URL to receive the report on completion |

## Async webhook

If you provide a `webhookUrl`, the platform will POST the full report to that URL when all testers have submitted:

```json
{
  "taskId": "...",
  "status": "COMPLETED",
  "title": "Test: example.com",
  "targetUrl": "https://example.com",
  "report": "## Executive Summary\n...",
  "completedAt": "2026-03-02T12:00:00Z"
}
```

## Credits

- Signup: 100 free credits
- Creating a task costs: `rewardPerTester × maxTesters` credits
- Earn credits by testing other people's products (20 credits per test)

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

## Links

- Web platform: https://human-test.work
- API docs: https://human-test.work/settings (after login, shows curl examples)
