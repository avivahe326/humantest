import { chat } from '@/lib/ai-client'
import { prisma } from '@/lib/prisma'
import { sendWebhook } from '@/lib/webhook'
import { analyzeMediaForFeedback, generateAggregateReport } from '@/lib/gemini'
import { runCodeFixAnalysis } from '@/lib/code-fixer'
import { getLanguageInstruction } from '@/lib/ai-locale'

interface RawData {
  firstImpression: string
  steps: { id: string; answer: string }[]
  nps: number
  best: string
  worst: string
}

/**
 * Text-only report generation via Claude (fallback when no media exists).
 */
export async function generateTextOnlyReport(taskId: string, timeoutMs: number = 1800000): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      feedbacks: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  })

  if (!task) throw new Error('Task not found')
  if (task.feedbacks.length === 0) throw new Error('No feedback to generate report from')

  const feedbackSections = task.feedbacks.map((fb, i) => {
    const raw = fb.rawData as RawData | null
    const testerLabel = fb.user.name || `Tester ${i + 1}`

    if (!raw) {
      return `### ${testerLabel}\n${fb.textFeedback || 'No feedback provided'}`
    }

    return `### ${testerLabel}
**First Impression:** ${raw.firstImpression}
**Task Steps:**
${raw.steps.map(s => `- Step ${s.id}: ${s.answer}`).join('\n')}
**NPS Score:** ${raw.nps}/10
**Best Part:** ${raw.best}
**Worst Part:** ${raw.worst}
${fb.screenRecUrl ? `**Screen Recording:** ${fb.screenRecUrl}` : ''}
${fb.audioUrl ? `**Audio:** ${fb.audioUrl}` : ''}`
  }).join('\n\n---\n\n')

  const npsScores = task.feedbacks
    .map(fb => (fb.rawData as RawData | null)?.nps)
    .filter((n): n is number => n !== undefined)
  const avgNps = npsScores.length > 0 ? (npsScores.reduce((a, b) => a + b, 0) / npsScores.length).toFixed(1) : 'N/A'

  const response = await chat(
    [
      {
        role: 'user',
        content: `Generate a usability test report for "${task.title}" (${task.targetUrl}).
${task.focus ? `Focus area: ${task.focus}` : ''}

**${task.feedbacks.length} testers participated. Average NPS: ${avgNps}/10.**

## Raw Feedback:

${feedbackSections}

---

Generate the report with these exact section headers:

## Metadata
(Markdown table: Product, URL, Testers, Avg NPS, Focus Area, Date)

## Executive Summary
(3-5 sentences. State the most critical finding first.)

## Issues
(List ALL issues found. Each issue MUST follow this format:)
### [SEVERITY] Issue title
- **Evidence:** (cite specific testers and what they experienced)
- **Impact:** (how it affects users — conversion, trust, task completion, etc.)
- **Recommendation:** (specific, actionable fix)

## Positive Highlights
(What worked well, with evidence from testers)

## NPS Analysis
(Score breakdown, interpretation, correlation with issues found)

## Recommendations
(Prioritized action items. Use P0/P1/P2/P3 tags. Each recommendation should reference the issue it addresses.)`,
      },
    ],
    {
      system: `You are a UX research analyst. Generate a structured usability report that is optimized for AI agents to parse and act on. Use markdown formatting with consistent structure. Cite specific testers by name.

IMPORTANT: Follow this exact output format so AI agents can reliably parse the report:

1. Start with a metadata block in a markdown table (product, URL, testers, avg NPS, date)
2. Use exact section headers as specified
3. For every issue, use this format:
   - **[SEVERITY] Issue title** (SEVERITY must be one of: CRITICAL, MAJOR, MINOR)
   - Evidence: what was observed and by whom
   - Impact: how it affects users
   - Recommendation: specific fix

4. For recommendations, use priority tags: P0 (fix immediately), P1 (fix this sprint), P2 (next sprint), P3 (backlog)` + getLanguageInstruction(task.locale),
      maxTokens: 4096,
      temperature: 0.5,
      timeoutMs,
      maxRetries: 0,
    }
  )

  return response.text || 'Report generation failed.'
}

/**
 * Full report generation with Gemini media analysis.
 * Phase 1: Parallel per-tester video/audio analysis
 * Phase 2: Aggregate report from all analyses
 */
export async function generateReport(taskId: string): Promise<string> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      feedbacks: {
        include: {
          user: { select: { name: true } },
        },
      },
    },
  })

  if (!task) throw new Error('Task not found')
  if (task.feedbacks.length === 0) throw new Error('No feedback to generate report from')

  const hasAnyMedia = task.feedbacks.some(fb => fb.screenRecUrl || fb.audioUrl)

  // If no media at all, fall back to text-only report
  if (!hasAnyMedia) {
    const report = await generateTextOnlyReport(taskId)
    await prisma.task.updateMany({
      where: { id: taskId, report: null },
      data: { report, reportStatus: 'COMPLETED' },
    })
    if (task.repoUrl) {
      await prisma.task.update({ where: { id: taskId }, data: { codeFixStatus: 'GENERATING' } })
      runCodeFixAnalysis(taskId).catch(err => console.error('Code fix error:', err))
    } else if (task.webhookUrl) {
      try { await sendWebhook(taskId) } catch (err) { console.error('Webhook error:', err) }
    }
    return report
  }

  // Phase 1: Parallel per-tester media analysis
  console.log(`[Report ${taskId}] Phase 1: Analyzing media for ${task.feedbacks.length} testers`)

  // Mark all feedbacks with media as GENERATING
  const feedbacksWithMedia = task.feedbacks.filter(fb => fb.screenRecUrl || fb.audioUrl)
  await prisma.feedback.updateMany({
    where: { id: { in: feedbacksWithMedia.map(fb => fb.id) } },
    data: { mediaAnalysisStatus: 'GENERATING' },
  })

  const analysisResults = await Promise.allSettled(
    feedbacksWithMedia.map(async (feedback) => {
      try {
        const analysis = await analyzeMediaForFeedback(feedback, task, task.locale)
        await prisma.feedback.update({
          where: { id: feedback.id },
          data: { mediaAnalysis: analysis, mediaAnalysisStatus: 'COMPLETED' },
        })
        return { feedbackId: feedback.id, analysis }
      } catch (err) {
        console.error(`[Report ${taskId}] Media analysis failed for feedback ${feedback.id}:`, err)
        await prisma.feedback.update({
          where: { id: feedback.id },
          data: { mediaAnalysisStatus: 'FAILED' },
        })
        throw err
      }
    })
  )

  // Collect completed analyses
  const completedCount = analysisResults.filter(r => r.status === 'fulfilled').length
  console.log(`[Report ${taskId}] Phase 1 complete: ${completedCount}/${feedbacksWithMedia.length} analyses succeeded`)

  // Re-fetch feedbacks to get updated mediaAnalysis
  const updatedFeedbacks = await prisma.feedback.findMany({
    where: { taskId },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  // Phase 2: Aggregate report
  console.log(`[Report ${taskId}] Phase 2: Generating aggregate report`)

  const feedbackAnalyses = updatedFeedbacks.map(fb => {
    const raw = fb.rawData as RawData | null
    return {
      testerName: fb.user.name || 'Anonymous',
      mediaAnalysis: fb.mediaAnalysis,
      textFeedback: fb.textFeedback,
      rawData: fb.rawData,
      nps: raw?.nps ?? null,
    }
  })

  const report = await generateAggregateReport(task, feedbackAnalyses, task.locale)

  await prisma.task.update({
    where: { id: taskId },
    data: { report, reportStatus: 'COMPLETED' },
  })

  if (task.repoUrl) {
    await prisma.task.update({ where: { id: taskId }, data: { codeFixStatus: 'GENERATING' } })
    runCodeFixAnalysis(taskId).catch(err => console.error('Code fix error:', err))
  } else if (task.webhookUrl) {
    try { await sendWebhook(taskId) } catch (err) { console.error('Webhook error:', err) }
  }

  console.log(`[Report ${taskId}] Report generation complete`)
  return report
}

export function startReportGeneration(taskId: string): void {
  // Atomically set GENERATING — prevents concurrent runs
  // NOTE: Prisma + MySQL `{ not: 'X' }` excludes NULLs, so list accepted values explicitly
  prisma.task.updateMany({
    where: {
      id: taskId,
      report: null,
      OR: [
        { reportStatus: null },
        { reportStatus: { in: ['FAILED', 'COMPLETED'] } },
      ],
    },
    data: { reportStatus: 'GENERATING' },
  }).then((result) => {
    if (result.count === 0) {
      console.log('Report generation already in progress or report exists for task:', taskId)
      return
    }
    return generateReport(taskId)
  }).catch((err) => {
    console.error('Report generation failed for task:', taskId, err)
    prisma.task.update({
      where: { id: taskId },
      data: { reportStatus: 'FAILED' },
    }).catch((updateErr) => {
      console.error('Failed to set FAILED status for task:', taskId, updateErr)
    })
  })
}
