import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { submitFeedbackSchema } from '@/lib/validate'
import { awardCredits, getBalance } from '@/lib/credits'
import { prisma } from '@/lib/prisma'
import { generateReport } from '@/lib/ai-report'

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
      include: { _count: { select: { feedbacks: true } } },
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

    // Save feedback and update claim
    await prisma.$transaction([
      prisma.feedback.create({
        data: {
          taskId: id,
          claimId: claim.id,
          userId: user!.id,
          textFeedback,
          screenRecUrl: data.screenRecUrl,
          audioUrl: data.audioUrl,
          rawData: data.rawData,
        },
      }),
      prisma.taskClaim.update({
        where: { id: claim.id },
        data: { status: 'SUBMITTED' },
      }),
    ])

    // Award credits immediately
    await awardCredits(user!.id, task.rewardPerTester, 'TASK_REWARD', id)

    // Check if this is the last submission
    const newSubmittedCount = task._count.feedbacks + 1
    if (newSubmittedCount >= task.maxTesters) {
      await prisma.task.update({
        where: { id },
        data: { status: 'COMPLETED' },
      })
      // Generate report (handles webhook internally)
      try {
        await generateReport(id)
      } catch (err) {
        console.error('Report generation error:', err)
      }
    }

    const newBalance = await getBalance(user!.id)

    return NextResponse.json({
      success: true,
      creditsEarned: task.rewardPerTester,
      newBalance,
    })
  } catch (err) {
    console.error('Submit error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
