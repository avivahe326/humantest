import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Read task inside transaction
      const task = await tx.task.findUnique({ where: { id } })

      if (!task) throw { appCode: 'NOT_FOUND' }
      if (task.creatorId !== user!.id) throw { appCode: 'FORBIDDEN' }

      // 2. Atomic conditional update: only cancel if status is OPEN/IN_PROGRESS
      const updated = await tx.task.updateMany({
        where: { id, status: { in: ['OPEN', 'IN_PROGRESS'] }, creatorId: user!.id },
        data: { status: 'CANCELLED' },
      })

      if (updated.count === 0) throw { appCode: 'CONFLICT' }

      // 3. Abandon in-progress claims
      await tx.taskClaim.updateMany({
        where: { taskId: id, status: 'IN_PROGRESS' },
        data: { status: 'ABANDONED' },
      })
    }, { timeout: 10000 })

    return NextResponse.json({ cancelled: true })
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
