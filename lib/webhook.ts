import { prisma } from '@/lib/prisma'
import { isPrivateUrl } from '@/lib/validate'

export async function sendWebhook(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      title: true,
      targetUrl: true,
      report: true,
      webhookUrl: true,
      codeFixPrUrl: true,
    },
  })

  if (!task?.webhookUrl) return

  // SSRF protection
  try {
    const url = new URL(task.webhookUrl)
    if (url.protocol !== 'https:') {
      console.warn(`Webhook skipped: non-https URL ${task.webhookUrl}`)
      return
    }
    if (isPrivateUrl(task.webhookUrl)) {
      console.warn(`Webhook skipped: private IP detected in ${task.webhookUrl}`)
      return
    }
  } catch {
    console.warn(`Webhook skipped: invalid URL ${task.webhookUrl}`)
    return
  }

  // Fire-and-forget with 10s timeout
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    await fetch(task.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        taskId: task.id,
        status: task.status,
        title: task.title,
        targetUrl: task.targetUrl,
        report: task.report,
        codeFixPrUrl: task.codeFixPrUrl || undefined,
        completedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    })
  } catch (err) {
    console.error(`Webhook delivery failed for task ${taskId}:`, err)
  } finally {
    clearTimeout(timeout)
  }
}
