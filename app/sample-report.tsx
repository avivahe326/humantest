'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Issue {
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR'
  title: string
  evidence: string
  impact: string
  recommendation: string
}

const issues: Issue[] = [
  {
    severity: 'CRITICAL',
    title: 'Dead URL at test entry point — bare nginx 404 on sogo.com',
    evidence: 'lizhi landed on a bare nginx 404 at sogo.com for the first ~9 seconds. Recovery only happened because the tester already knew the correct domain (sogou.com).',
    impact: 'First-time users have zero recovery path — no branded error page, no redirect, no suggestion. 100% bounce rate for mistyped URLs.',
    recommendation: 'Implement a 301 redirect from sogo.com → sogou.com, or deploy a branded error page with "Did you mean sogou.com?" recovery link.',
  },
  {
    severity: 'CRITICAL',
    title: 'Product failed to retain user — exited to competitor within 78 seconds',
    evidence: 'lizhi left the product twice: at ~48s to a 163.com article about search engine alternatives, and at ~72s to competitor 360 Search (so.com).',
    impact: 'For a search engine, losing users to a competitor article within the first session is a core retention failure.',
    recommendation: 'Add task scaffolding to the homepage — featured search prompts, category entry points, or a value proposition that gives users a reason to stay.',
  },
  {
    severity: 'MAJOR',
    title: 'Pre-populated search query is visually ambiguous',
    evidence: 'At ~12s, lizhi encountered a trending news query pre-injected into the search box. It\'s visually indistinguishable from user input.',
    impact: 'Risks accidental searches and erodes trust in the input state.',
    recommendation: 'Use placeholder styling (grayed text) or a distinct "trending" label. Move trending suggestions below the input field.',
  },
  {
    severity: 'MAJOR',
    title: 'No task completion observed — no goal-directed search executed',
    evidence: 'Every query lizhi executed was exploratory or meta. The homepage provided no scaffolding to prompt a real search task.',
    impact: 'Users evaluate the product rather than use it, leading to shallow engagement and early exit.',
    recommendation: 'Add featured search prompts, category entry points, or contextual suggestions that guide users toward a concrete action.',
  },
  {
    severity: 'MINOR',
    title: 'Ming Yi (medical search) has no onboarding copy',
    evidence: 'At ~24-30s, lizhi visited Ming Yi but found no placeholder text or scope description for medical queries.',
    impact: 'Users don\'t understand what this sub-product does or how to use it effectively.',
    recommendation: 'Add placeholder text and a brief descriptor communicating the medical search scope.',
  },
]

const recommendations = [
  { priority: 'P0', text: 'Implement 301 redirect from sogo.com → sogou.com', issue: 'Dead URL entry point' },
  { priority: 'P1', text: 'Redesign search box input state to distinguish trending queries from user input', issue: 'Ambiguous pre-populated query' },
  { priority: 'P1', text: 'Add homepage task scaffolding — featured prompts, category entry points', issue: 'No task completion, user retention failure' },
  { priority: 'P3', text: 'Add contextual onboarding copy to Ming Yi medical search', issue: 'Ming Yi has no onboarding' },
]

const severityColor: Record<string, string> = {
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
  MAJOR: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  MINOR: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
}

const priorityColor: Record<string, string> = {
  P0: 'bg-red-500/15 text-red-400 border-red-500/30',
  P1: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  P2: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  P3: 'bg-muted text-muted-foreground border-border',
}

function SeverityBadge({ severity }: { severity: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border ${severityColor[severity] || ''}`}>
      {severity}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border ${priorityColor[priority] || ''}`}>
      {priority}
    </span>
  )
}

function IssueCard({ issue }: { issue: Issue }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <SeverityBadge severity={issue.severity} />
        <h4 className="text-sm font-semibold leading-snug">{issue.title}</h4>
      </div>
      <div className="grid gap-2 text-xs">
        <div className="flex gap-2">
          <span className="shrink-0 font-semibold text-muted-foreground w-28">Evidence</span>
          <span>{issue.evidence}</span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 font-semibold text-muted-foreground w-28">Impact</span>
          <span>{issue.impact}</span>
        </div>
        <div className="flex gap-2">
          <span className="shrink-0 font-semibold text-primary w-28">Recommendation</span>
          <span>{issue.recommendation}</span>
        </div>
      </div>
    </div>
  )
}

export function SampleReport() {
  const [expanded, setExpanded] = useState(false)

  const visibleIssues = expanded ? issues : issues.slice(0, 2)

  return (
    <Card className="mx-auto max-w-3xl">
      <CardContent className="pt-6 space-y-6">
        {/* Metadata */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="font-mono">sogou.com</Badge>
          <Badge variant="outline">1 Tester</Badge>
          <Badge>NPS: 8.0/10</Badge>
          <span className="text-xs text-muted-foreground ml-auto">2 Critical · 2 Major · 1 Minor</span>
        </div>

        {/* Executive Summary */}
        <div className="rounded-lg bg-muted/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Executive Summary</h3>
          <p className="text-sm leading-relaxed">
            A single usability session with tester lizhi revealed a critical infrastructure failure — the bare nginx 404 on <code className="text-xs bg-muted px-1 py-0.5 rounded">sogo.com</code> — that would prevent any new user from reaching the product. The tester exited to a competitor (360 Search) within 78 seconds without completing a single goal-directed search.
          </p>
        </div>

        {/* Issues */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issues ({issues.length})</h3>
          {visibleIssues.map((issue, i) => (
            <IssueCard key={i} issue={issue} />
          ))}
        </div>

        {/* Recommendations (only in expanded) */}
        {expanded && (
          <>
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</h3>
              <div className="space-y-2">
                {recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <PriorityBadge priority={rec.priority} />
                    <div>
                      <span>{rec.text}</span>
                      <span className="text-xs text-muted-foreground ml-1">→ {rec.issue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Positive Highlights */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Positive Highlights</h3>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Core search engine loaded and operated correctly once accessed</li>
                <li>• Sub-product diversity (Ming Yi medical search) shows product ambition</li>
              </ul>
            </div>
          </>
        )}

        {/* Expand/Collapse */}
        <div className="text-center pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? 'Show less' : `Show all ${issues.length} issues + recommendations...`}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
