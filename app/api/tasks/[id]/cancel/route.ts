import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getBalance } from '@/lib/credits'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  try {
    const { refundAmount } = await prisma.$transaction(async (tx) => {
      // 1. Read task inside transaction
      const task = await tx.task.findUnique({ where: { id } })

      if (!task) throw { appCode: 'NOT_FOUND' }
      if (task.creatorId !== user!.id) throw { appCode: 'FORBIDDEN' }

      // 2. Count feedbacks inside transaction for consistent refund calculation
      const submittedCount = await tx.feedback.count({ where: { taskId: id } })

      // 3. Atomic conditional update: only cancel if status is OPEN/IN_PROGRESS
      const updated = await tx.task.updateMany({
        where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] }, creatorId: user!.id },
        data: { status: 'CANCELLED' },
      })

      if (updated.count === 0) throw { appCode: 'CONFLICT' }

      // 4. Abandon in-progress claims
      await tx.taskClaim.updateMany({
        where: { taskId: id, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED' },
      })

      // 5. Calculate and execute refund inside transaction
      const refundAmount = Math.max(0, task.rewardPerTester * (task.maxTesters - submittedCount))

      if (refundAmount > 0) {
        await tx.user.update({
          where: { id: user!.id },
          data: { credits: { increment: refundAmount } },
        })
        await tx.creditTransaction.create({
          data: { userId: user!.id, amount: refundAmount, type: 'TASK_REFUND', taskId: id },
        })
      }

      return { refundAmount }
    }, { timeout: 10000 })

    const newBalance = await getBalance(user!.id)
    return NextResponse.json({ refunded: refundAmount, newBalance })
  } catch (err: any) {
    if (err.appCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (err.appCode === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (err.appCode === 'CONFLICT') {
      const task = await prisma.task.findUnique({ where: { id }, select: { status: true } })
      return NextResponse.json(
        { error: 'Task status conflict', currentStatus: task?.status },
        { status: 409 }
      )
    }
    console.error('Cancel error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
