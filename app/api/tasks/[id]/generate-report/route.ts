import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { getBalance } from '@/lib/credits'
import { generateReport } from '@/lib/ai-report'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Read task inside transaction
      const task = await tx.task.findUnique({ where: { id } })

      if (!task) throw { appCode: 'NOT_FOUND' }
      if (task.creatorId !== user!.id) throw { appCode: 'FORBIDDEN' }

      // 2. Status check with retry support (F2)
      if (task.status === 'CANCELLED') throw { appCode: 'CONFLICT', currentStatus: 'CANCELLED' }
      if (task.status === 'COMPLETED' && task.report !== null) throw { appCode: 'REPORT_EXISTS' }

      // Retry path: COMPLETED but report failed previously — skip state changes
      if (task.status === 'COMPLETED' && task.report === null) {
        return { refundAmount: 0 }
      }

      // 3. Count feedbacks inside transaction
      const submittedCount = await tx.feedback.count({ where: { taskId: id } })
      if (submittedCount < 1) throw { appCode: 'NO_SUBMISSIONS' }

      // 4. Atomic conditional update: only complete if status is OPEN/IN_PROGRESS
      const updated = await tx.task.updateMany({
        where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] }, creatorId: user!.id },
        data: { status: 'COMPLETED' },
      })

      if (updated.count === 0) throw { appCode: 'CONFLICT' }

      // 5. Abandon in-progress claims
      await tx.taskClaim.updateMany({
        where: { taskId: id, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED' },
      })

      // 6. Calculate and execute refund inside transaction
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

    // Generate report outside transaction (AI API call is long-running)
    let report = null
    let reportError = false
    try {
      report = await generateReport(id)
    } catch (err) {
      console.error('Report generation error:', err)
      reportError = true
    }

    const newBalance = await getBalance(user!.id)
    return NextResponse.json({
      report,
      refunded: result.refundAmount,
      newBalance,
      ...(reportError && { reportError: true }),
    })
  } catch (err: any) {
    if (err.appCode === 'NOT_FOUND') {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 })
    }
    if (err.appCode === 'FORBIDDEN') {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (err.appCode === 'REPORT_EXISTS') {
      return NextResponse.json({ error: 'Report already generated' }, { status: 400 })
    }
    if (err.appCode === 'NO_SUBMISSIONS') {
      return NextResponse.json(
        { error: 'At least 1 submission is required to generate a report' },
        { status: 400 }
      )
    }
    if (err.appCode === 'CONFLICT') {
      return NextResponse.json(
        { error: 'Task status conflict', currentStatus: err.currentStatus ?? null },
        { status: 409 }
      )
    }
    console.error('Generate report error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
