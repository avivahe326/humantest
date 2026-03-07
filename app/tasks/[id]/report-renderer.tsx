'use client'

import { useState, useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface ParsedIssue {
  severity: string
  title: string
  evidence: string
  impact: string
  recommendation: string
}

interface ParsedRecommendation {
  priority: string
  text: string
}

interface ParsedMetadata {
  product?: string
  url?: string
  testers?: string
  avgNps?: string
  focus?: string
}

interface ParsedReport {
  metadata: ParsedMetadata
  executiveSummary: string
  issues: ParsedIssue[]
  positiveHighlights: string
  npsAnalysis: string
  recommendations: ParsedRecommendation[]
  codeFixSuggestions: string
  extraSections: { title: string; content: string }[]
}

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
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border ${severityColor[severity] || 'bg-muted text-muted-foreground border-border'}`}>
      {severity}
    </span>
  )
}

function PriorityBadge({ priority }: { priority: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-bold border ${priorityColor[priority] || 'bg-muted text-muted-foreground border-border'}`}>
      {priority}
    </span>
  )
}

function IssueCard({ issue }: { issue: ParsedIssue }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-4 space-y-3">
      <div className="flex items-start gap-2">
        <SeverityBadge severity={issue.severity} />
        <h4 className="text-sm font-semibold leading-snug">{issue.title}</h4>
      </div>
      <div className="grid gap-2 text-xs">
        {issue.evidence && (
          <div className="flex gap-2">
            <span className="shrink-0 font-semibold text-muted-foreground w-28">Evidence</span>
            <span>{issue.evidence}</span>
          </div>
        )}
        {issue.impact && (
          <div className="flex gap-2">
            <span className="shrink-0 font-semibold text-muted-foreground w-28">Impact</span>
            <span>{issue.impact}</span>
          </div>
        )}
        {issue.recommendation && (
          <div className="flex gap-2">
            <span className="shrink-0 font-semibold text-primary w-28">Recommendation</span>
            <span>{issue.recommendation}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function parseReport(markdown: string): ParsedReport {
  const result: ParsedReport = {
    metadata: {},
    executiveSummary: '',
    issues: [],
    positiveHighlights: '',
    npsAnalysis: '',
    recommendations: [],
    codeFixSuggestions: '',
    extraSections: [],
  }

  // Split into top-level sections by ## headers
  const sections: { title: string; content: string }[] = []
  const lines = markdown.split('\n')
  let currentTitle = ''
  let currentLines: string[] = []

  for (const line of lines) {
    const h2Match = line.match(/^## (.+)/)
    if (h2Match) {
      if (currentTitle || currentLines.length > 0) {
        sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
      }
      currentTitle = h2Match[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }
  if (currentTitle || currentLines.length > 0) {
    sections.push({ title: currentTitle, content: currentLines.join('\n').trim() })
  }

  for (const section of sections) {
    const titleLower = section.title.toLowerCase()

    if (titleLower === 'metadata') {
      // Parse markdown table rows
      const tableRows = section.content.split('\n').filter(l => l.includes('|') && !l.match(/^\|[\s-|]+\|$/))
      for (const row of tableRows) {
        const cells = row.split('|').map(c => c.trim()).filter(Boolean)
        if (cells.length >= 2) {
          const key = cells[0].toLowerCase()
          const val = cells[1]
          if (key.includes('product')) result.metadata.product = val
          else if (key === 'url') result.metadata.url = val
          else if (key.includes('tester')) result.metadata.testers = val
          else if (key.includes('nps')) result.metadata.avgNps = val
          else if (key.includes('focus')) result.metadata.focus = val
        }
      }
    } else if (titleLower === 'executive summary') {
      result.executiveSummary = section.content
    } else if (titleLower === 'issues') {
      result.issues = parseIssues(section.content)
    } else if (titleLower.includes('positive')) {
      result.positiveHighlights = section.content
    } else if (titleLower.includes('nps')) {
      result.npsAnalysis = section.content
    } else if (titleLower === 'recommendations') {
      result.recommendations = parseRecommendations(section.content)
    } else if (titleLower.includes('code fix')) {
      result.codeFixSuggestions = section.content
    } else if (section.title) {
      result.extraSections.push(section)
    }
  }

  return result
}

function parseIssues(content: string): ParsedIssue[] {
  const issues: ParsedIssue[] = []
  // Split by ### headers
  const blocks = content.split(/^### /m).filter(Boolean)

  for (const block of blocks) {
    const lines = block.split('\n')
    const headerLine = lines[0].trim()
    // Match [SEVERITY] title
    const match = headerLine.match(/^\[?(CRITICAL|MAJOR|MINOR)\]?\s+(.+)/i)
    if (!match) continue

    const severity = match[1].toUpperCase()
    const title = match[2]
    const body = lines.slice(1).join('\n')

    const evidence = extractField(body, 'Evidence')
    const impact = extractField(body, 'Impact')
    const recommendation = extractField(body, 'Recommendation')

    issues.push({ severity, title, evidence, impact, recommendation })
  }

  return issues
}

function extractField(text: string, field: string): string {
  // Match - **Field:** value or **Field:** value
  const regex = new RegExp(`[-*]*\\s*\\*\\*${field}:?\\*\\*:?\\s*(.+?)(?=\\n[-*]*\\s*\\*\\*|$)`, 'is')
  const match = text.match(regex)
  return match ? match[1].trim() : ''
}

function parseRecommendations(content: string): ParsedRecommendation[] {
  const recs: ParsedRecommendation[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    // Match - **P0** (description): text  OR  - **P0**: text  OR  - P0: text
    const match = line.match(/[-*]\s*\*?\*?(P[0-3])\*?\*?\s*(?:\([^)]*\)\s*)?:?\s*(.+)/i)
    if (match) {
      recs.push({ priority: match[1].toUpperCase(), text: match[2].trim() })
    }
  }

  return recs
}

function countSeverities(issues: ParsedIssue[]): string {
  const counts: Record<string, number> = {}
  for (const issue of issues) {
    counts[issue.severity] = (counts[issue.severity] || 0) + 1
  }
  return Object.entries(counts)
    .map(([sev, count]) => `${count} ${sev.charAt(0)}${sev.slice(1).toLowerCase()}`)
    .join(' · ')
}

export function ReportRenderer({ report }: { report: string }) {
  const [expanded, setExpanded] = useState(false)
  const parsed = useMemo(() => parseReport(report), [report])

  const hasStructuredContent = parsed.issues.length > 0 || parsed.executiveSummary || Object.keys(parsed.metadata).length > 0

  // If parsing found no structured content, fall back to raw markdown
  if (!hasStructuredContent) {
    return (
      <div className="prose prose-invert max-w-none">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{report}</ReactMarkdown>
      </div>
    )
  }

  const visibleIssues = expanded ? parsed.issues : parsed.issues.slice(0, 3)
  const hasMore = parsed.issues.length > 3

  return (
    <div className="space-y-6">
      {/* Metadata badges */}
      {Object.keys(parsed.metadata).length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {parsed.metadata.product && <Badge variant="secondary" className="font-mono">{parsed.metadata.product}</Badge>}
          {parsed.metadata.testers && <Badge variant="outline">{parsed.metadata.testers} Tester{parsed.metadata.testers === '1' ? '' : 's'}</Badge>}
          {parsed.metadata.avgNps && <Badge>NPS: {parsed.metadata.avgNps}</Badge>}
          {parsed.issues.length > 0 && (
            <span className="text-xs text-muted-foreground ml-auto">{countSeverities(parsed.issues)}</span>
          )}
        </div>
      )}

      {/* Executive Summary */}
      {parsed.executiveSummary && (
        <div className="rounded-lg bg-muted/50 p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Executive Summary</h3>
          <div className="text-sm leading-relaxed prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.executiveSummary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Issues */}
      {parsed.issues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Issues ({parsed.issues.length})</h3>
          {visibleIssues.map((issue, i) => (
            <IssueCard key={i} issue={issue} />
          ))}
          {hasMore && !expanded && (
            <div className="text-center pt-1">
              <Button variant="ghost" size="sm" onClick={() => setExpanded(true)}>
                Show all {parsed.issues.length} issues...
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {parsed.recommendations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recommendations</h3>
          <div className="space-y-2">
            {parsed.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3 text-sm">
                <PriorityBadge priority={rec.priority} />
                <span>{rec.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Positive Highlights */}
      {parsed.positiveHighlights && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Positive Highlights</h3>
          <div className="text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.positiveHighlights}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* NPS Analysis */}
      {parsed.npsAnalysis && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">NPS Analysis</h3>
          <div className="text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.npsAnalysis}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Code Fix Suggestions */}
      {parsed.codeFixSuggestions && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Code Fix Suggestions</h3>
          <div className="text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{parsed.codeFixSuggestions}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Any extra sections */}
      {parsed.extraSections.map((section, i) => (
        <div key={i} className="space-y-2">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{section.title}</h3>
          <div className="text-sm prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{section.content}</ReactMarkdown>
          </div>
        </div>
      ))}

      {/* Collapse button (only if expanded) */}
      {expanded && hasMore && (
        <div className="text-center pt-1">
          <Button variant="ghost" size="sm" onClick={() => setExpanded(false)}>
            Show less
          </Button>
        </div>
      )}
    </div>
  )
}
