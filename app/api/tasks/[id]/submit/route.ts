import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { submitFeedbackSchema } from '@/lib/validate'
import { prisma } from '@/lib/prisma'
import { startReportGeneration } from '@/lib/ai-report'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  try {
    const body = await request.json()
    const parsed = submitFeedbackSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 })
    }

    const task = await prisma.task.findUnique({
      where: { id },
    })

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }

    if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
      return NextResponse.json({ error: 'Task is no longer accepting submissions' }, { status: 410 })
    }

    const claim = await prisma.taskClaim.findFirst({
      where: { taskId: id, userId: user!.id, status: 'IN_PROGRESS' },
    })

    if (!claim) {
      return NextResponse.json({ error: 'You have not claimed this task or already submitted' }, { status: 403 })
    }

    const data = parsed.data

    // Build textFeedback summary
    const textParts = [
      `First Impression: ${data.rawData.firstImpression}`,
      ...data.rawData.steps.map(s => `Step ${s.id}: ${s.answer}`),
      `NPS: ${data.rawData.nps}/10`,
      `Best: ${data.rawData.best}`,
      `Worst: ${data.rawData.worst}`,
    ]
    const textFeedback = textParts.join('\n\n')

    // Save feedback, update claim, and check completion atomically
    const isLastSubmission = await prisma.$transaction(async (tx) => {
      await tx.feedback.create({
        data: {
          taskId: id,
          claimId: claim.id,
          userId: user!.id,
          textFeedback,
          screenRecUrl: data.screenRecUrl,
          audioUrl: data.audioUrl,
          rawData: data.rawData,
        },
      })

      await tx.taskClaim.update({
        where: { id: claim.id },
        data: { status: 'SUBMITTED' },
      })

      // Count submissions inside the transaction for atomicity
      const submittedCount = await tx.feedback.count({ where: { taskId: id } })

      if (submittedCount >= task.maxTesters) {
        // Atomic: only update if still IN_PROGRESS (prevents double-completion)
        const updated = await tx.task.updateMany({
          where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] } },
          data: { status: 'COMPLETED' },
        })
        return updated.count > 0
      }
      return false
    })

    // Generate report only if this transaction was the one to mark COMPLETED
    if (isLastSubmission) {
      startReportGeneration(id)  // fire-and-forget, no await
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
