'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const REPORT = `## 1. Executive Summary

A single usability session with tester lizhi revealed a functionally competent product that nonetheless failed to retain user attention within a 78-second session. The user exited the product twice — once to a third-party article about search engine alternatives, and once to a direct competitor (360 Search) — without completing any goal-directed task. The most critical infrastructure issue is the bare nginx 404 on \`sogo.com\`, which creates an immediate trust failure for any user who doesn't already know the correct URL.

## 2. Key Findings

Ranked by severity:

**1. Dead URL at test entry point (Critical)**
lizhi landed on a bare nginx 404 at \`sogo.com\` for the first ~9 seconds. Recovery only happened because the tester already knew the correct domain. A first-time user has no recovery path — no branded error page, no redirect, no suggestion.

**2. Product failed to retain the user (Critical)**
lizhi left the product twice within 78 seconds: at ~48s to a 163.com article explicitly about *alternatives* to major search engines, and at ~72s to competitor 360 Search (\`so.com\`). For a search engine, this exit pattern is the core finding.

**3. No task completion observed (Major)**
Every query lizhi executed was exploratory or meta. The homepage and sub-product onboarding provided no scaffolding that prompted a real search task. The user evaluated the product rather than used it.

**4. Pre-populated search query is disorienting (Major)**
At ~12s, lizhi encountered a trending news query pre-injected into the search box. It's visually ambiguous whether this is user input or a suggestion, which risks accidental searches and erodes trust in the input state.

## 3. Friction & Pain Points

| Severity | Issue | Tester | Timestamp |
|----------|-------|--------|-----------|
| Critical | Bare nginx 404 on \`sogo.com\` — no redirect, no branded error page | lizhi | ~0–9s |
| Critical | User exited to competitor article mid-session, ended session on rival search engine | lizhi | ~48–69s, ~72s |
| Major | Pre-populated trending query in search box is visually ambiguous — looks like user input | lizhi | ~12s |
| Major | No task scaffolding on homepage — user never executed a goal-directed search | lizhi | Full session |
| Minor | Ming Yi has no onboarding copy or placeholder text scoped to medical queries | lizhi | ~24–30s |

## 4. Recommendations

Prioritized by impact and implementation effort:

**P0 — Fix the \`sogo.com\` entry point**
Implement a 301 redirect from \`sogo.com\` to \`sogou.com\`, or deploy a branded error page with a clear "Did you mean sogou.com?" recovery path.

**P1 — Redesign the search box input state**
The pre-populated trending query needs a clear visual distinction from user-typed input — use placeholder styling (grayed text), a distinct "trending" label, or move trending suggestions below the input entirely.

**P2 — Add task scaffolding to the homepage**
The homepage should prompt users toward a concrete action. Consider featured search prompts, category entry points, or a short value proposition statement.

**P3 — Add contextual onboarding to Ming Yi**
The medical search product needs placeholder text and/or a brief descriptor that communicates its scope before the user types.`

export function SampleReport() {
  const [expanded, setExpanded] = useState(false)

  // Show only executive summary + key findings when collapsed
  const previewEnd = REPORT.indexOf('## 3. Friction')
  const preview = REPORT.slice(0, previewEnd).trim()

  return (
    <Card className="mx-auto max-w-3xl">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-2 mb-2">
          <Badge variant="secondary">sogou.com</Badge>
          <Badge variant="outline">1 Tester</Badge>
          <Badge>NPS: 8.0/10</Badge>
        </div>
        <div className="prose prose-invert prose-sm max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {expanded ? REPORT : preview}
          </ReactMarkdown>
        </div>
        <div className="text-center pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : 'Show full report...'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
