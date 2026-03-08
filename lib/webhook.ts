import { prisma } from '@/lib/prisma'
import { isPrivateUrl } from '@/lib/validate'

function validateWebhookUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:') {
      console.warn(`Webhook skipped: non-https URL ${url}`)
      return false
    }
    if (isPrivateUrl(url)) {
      console.warn(`Webhook skipped: private IP detected in ${url}`)
      return false
    }
    return true
  } catch {
    console.warn(`Webhook skipped: invalid URL ${url}`)
    return false
  }
}

async function deliverWebhook(url: string, payload: Record<string, unknown>): Promise<void> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 10000)

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timeout)
  }
}

export async function sendReportWebhook(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      title: true,
      targetUrl: true,
      report: true,
      webhookUrl: true,
    },
  })

  if (!task?.webhookUrl) return
  if (!validateWebhookUrl(task.webhookUrl)) return

  try {
    await deliverWebhook(task.webhookUrl, {
      event: 'report',
      taskId: task.id,
      status: task.status,
      title: task.title,
      targetUrl: task.targetUrl,
      report: task.report,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error(`Report webhook delivery failed for task ${taskId}:`, err)
  }
}

export async function sendCodeFixWebhook(taskId: string): Promise<void> {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      status: true,
      title: true,
      targetUrl: true,
      codeFixWebhookUrl: true,
      codeFixPrUrl: true,
      codeFixStatus: true,
    },
  })

  if (!task?.codeFixWebhookUrl) return
  if (!validateWebhookUrl(task.codeFixWebhookUrl)) return

  try {
    await deliverWebhook(task.codeFixWebhookUrl, {
      event: 'code_fix',
      taskId: task.id,
      status: task.status,
      title: task.title,
      targetUrl: task.targetUrl,
      codeFixStatus: task.codeFixStatus,
      codeFixPrUrl: task.codeFixPrUrl || undefined,
      completedAt: new Date().toISOString(),
    })
  } catch (err) {
    console.error(`Code fix webhook delivery failed for task ${taskId}:`, err)
  }
}
