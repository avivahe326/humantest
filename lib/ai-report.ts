import Anthropic from '@anthropic-ai/sdk'
import { prisma } from '@/lib/prisma'
import { sendWebhook } from '@/lib/webhook'

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

export async function generateReport(taskId: string, timeoutMs: number = 1800000): Promise<string> {
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
  const report = (content && content.type === 'text') ? content.text : 'Report generation failed.'

  // Conditional update: only write if no report exists yet (prevents concurrent overwrites)
  await prisma.task.updateMany({
    where: { id: taskId, report: null },
    data: { report },
  })

  // Fire webhook if configured
  if (task.webhookUrl) {
    try {
      await sendWebhook(taskId)
    } catch (err) {
      console.error('Webhook error:', err)
    }
  }

  return report
}
