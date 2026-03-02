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

## Report contents

The AI-generated report includes:
- Executive Summary
- Key Findings (ranked by severity, citing specific testers)
- Usability Issues (Critical / Major / Minor)
- Positive Highlights
- NPS Analysis with breakdown
- Actionable Recommendations

## Links

- Web platform: https://human-test.work
- API docs: https://human-test.work/settings (after login, shows curl examples)
