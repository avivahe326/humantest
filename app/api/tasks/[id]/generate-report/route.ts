import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { refundCredits, getBalance } from '@/lib/credits'
import { generateReport } from '@/lib/ai-report'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      _count: { select: { feedbacks: true } },
    },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== user!.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Task is already completed or cancelled' }, { status: 400 })
  }

  const submittedCount = task._count.feedbacks
  if (submittedCount < 1) {
    return NextResponse.json({ error: 'At least 1 submission is required to generate a report' }, { status: 400 })
  }

  const refundAmount = task.rewardPerTester * (task.maxTesters - submittedCount)

  // Abandon remaining claims and mark task completed
  await prisma.$transaction([
    prisma.taskClaim.updateMany({
      where: { taskId: id, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED' },
    }),
    prisma.task.update({
      where: { id },
      data: { status: 'COMPLETED' },
    }),
  ])

  // Refund credits for non-submitted slots
  if (refundAmount > 0) {
    await refundCredits(user!.id, refundAmount, id)
  }

  // Generate report (handles webhook internally)
  const report = await generateReport(id)

  const newBalance = await getBalance(user!.id)

  return NextResponse.json({ report, refunded: refundAmount, newBalance })
}
