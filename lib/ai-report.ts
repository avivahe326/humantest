import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { sendWebhook } from '@/lib/webhook'
import { analyzeMediaForFeedback, generateAggregateReport } from '@/lib/gemini'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
  baseURL: process.env.ANTHROPIC_BASE_URL || 'https://api.aicodewith.com',
})

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

  const response = await anthropic.messages.create(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: 'You are a UX research analyst. Generate a comprehensive usability test report from tester feedback. Use markdown formatting. Cite specific testers by name when referencing their feedback.',
      messages: [
        {
          role: 'user',
          content: `Generate a usability test report for "${task.title}" (${task.targetUrl}).
${task.focus ? `Focus area: ${task.focus}` : ''}

**${task.feedbacks.length} testers participated. Average NPS: ${avgNps}/10.**

## Raw Feedback:

${feedbackSections}

---

Please generate a structured report with these sections:
1. **Executive Summary** (2-3 sentences)
2. **Key Findings** (ranked by severity, cite specific testers)
3. **Usability Issues** (with severity: Critical/Major/Minor)
4. **Positive Highlights** (what worked well)
5. **NPS Analysis** (breakdown and interpretation)
6. **Recommendations** (actionable next steps)`,
        },
      ],
      temperature: 0.5,
    },
    { timeout: timeoutMs, maxRetries: 0 }
  )

  const content = response.content[0]
  return (content && content.type === 'text') ? content.text : 'Report generation failed.'
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
    if (task.webhookUrl) {
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
        const analysis = await analyzeMediaForFeedback(feedback, task)
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

  const report = await generateAggregateReport(task, feedbackAnalyses)

  await prisma.task.update({
    where: { id: taskId },
    data: { report, reportStatus: 'COMPLETED' },
  })

  if (task.webhookUrl) {
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
