import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { refundCredits, getBalance } from '@/lib/credits'

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

  if (task.status !== 'OPEN' && task.status !== 'IN_PROGRESS') {
    return NextResponse.json({ error: 'Only OPEN or IN_PROGRESS tasks can be cancelled' }, { status: 400 })
  }

  const submittedCount = task._count.feedbacks
  const refundAmount = task.rewardPerTester * (task.maxTesters - submittedCount)

  // Cancel task and abandon in-progress claims in a transaction
  await prisma.$transaction([
    prisma.task.update({
      where: { id },
      data: { status: 'CANCELLED' },
    }),
    prisma.taskClaim.updateMany({
      where: { taskId: id, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED' },
    }),
  ])

  // Refund credits
  if (refundAmount > 0) {
    await refundCredits(user!.id, refundAmount, id)
  }

  const newBalance = await getBalance(user!.id)

  return NextResponse.json({ refunded: refundAmount, newBalance })
}
