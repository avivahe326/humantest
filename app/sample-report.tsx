'use client'

import { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const REPORT = `## Metadata

| Field | Value |
|-------|-------|
| Product | Sogou Search |
| URL | sogou.com |
| Testers | 1 |
| Avg NPS | 8.0/10 |

## Executive Summary

A single usability session with tester lizhi revealed a critical infrastructure failure — the bare nginx 404 on \`sogo.com\` — that would prevent any new user from reaching the product. The tester exited to a competitor (360 Search) within 78 seconds without completing a single goal-directed search, indicating both an entry-point failure and a lack of task scaffolding on the homepage.

## Issues

### [CRITICAL] Dead URL at test entry point — bare nginx 404 on sogo.com
- **Evidence:** lizhi landed on a bare nginx 404 at \`sogo.com\` for the first ~9 seconds. Recovery only happened because the tester already knew the correct domain (\`sogou.com\`).
- **Impact:** First-time users have zero recovery path — no branded error page, no redirect, no suggestion. 100% bounce rate for mistyped URLs.
- **Recommendation:** Implement a 301 redirect from \`sogo.com\` → \`sogou.com\`, or deploy a branded error page with "Did you mean sogou.com?" recovery link.

### [CRITICAL] Product failed to retain user — exited to competitor within 78 seconds
- **Evidence:** lizhi left the product twice: at ~48s to a 163.com article about search engine *alternatives*, and at ~72s to competitor 360 Search (\`so.com\`).
- **Impact:** For a search engine, losing users to a competitor article within the first session is a core retention failure.
- **Recommendation:** Add task scaffolding to the homepage — featured search prompts, category entry points, or a value proposition that gives users a reason to stay.

### [MAJOR] Pre-populated search query is visually ambiguous
- **Evidence:** At ~12s, lizhi encountered a trending news query pre-injected into the search box. It's visually indistinguishable from user input.
- **Impact:** Risks accidental searches and erodes trust in the input state. Users may think they typed something they didn't.
- **Recommendation:** Use placeholder styling (grayed text) or a distinct "trending" label. Move trending suggestions below the input field.

### [MAJOR] No task completion observed — no goal-directed search executed
- **Evidence:** Every query lizhi executed was exploratory or meta. The homepage provided no scaffolding to prompt a real search task.
- **Impact:** Users evaluate the product rather than use it, leading to shallow engagement and early exit.
- **Recommendation:** Add featured search prompts, category entry points, or contextual suggestions that guide users toward a concrete action.

### [MINOR] Ming Yi (medical search) has no onboarding copy
- **Evidence:** At ~24-30s, lizhi visited Ming Yi but found no placeholder text or scope description for medical queries.
- **Impact:** Users don't understand what this sub-product does or how to use it effectively.
- **Recommendation:** Add placeholder text and a brief descriptor communicating the medical search scope.

## Positive Highlights

- **Functional core search**: The main search engine at \`sogou.com\` loaded and operated correctly once accessed (lizhi, NPS 8.0)
- **Sub-product diversity**: Ming Yi (medical) and other verticals show product ambition and category expansion potential

## NPS Analysis

| Tester | NPS | Key Factor |
|--------|-----|------------|
| lizhi | 8/10 | Core product works, but entry point failure and lack of engagement scaffolding noted |

Average NPS: 8.0/10 — Relatively high despite critical issues, likely because the tester was already familiar with the product. New users hitting the nginx 404 would likely score significantly lower.

## Recommendations

- **P0** — Implement 301 redirect from \`sogo.com\` → \`sogou.com\` (addresses: Dead URL entry point)
- **P1** — Redesign search box input state to distinguish trending queries from user input (addresses: Ambiguous pre-populated query)
- **P1** — Add homepage task scaffolding — featured prompts, category entry points (addresses: No task completion, user retention failure)
- **P3** — Add contextual onboarding copy to Ming Yi medical search (addresses: Ming Yi has no onboarding)`

export function SampleReport() {
  const [expanded, setExpanded] = useState(false)

  // Show metadata + executive summary + first 2 issues when collapsed
  const previewEnd = REPORT.indexOf('### [MAJOR] Pre-populated')
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
