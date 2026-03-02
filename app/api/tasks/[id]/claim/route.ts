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

  const task = await prisma.task.findUnique({ where: { id } })
  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.status === 'COMPLETED' || task.status === 'CANCELLED') {
    return NextResponse.json({ error: 'Task is no longer accepting claims' }, { status: 410 })
  }

  if (task.creatorId === user!.id) {
    return NextResponse.json({ error: 'Cannot claim your own task' }, { status: 403 })
  }

  // Check spots remaining
  const claimCount = await prisma.taskClaim.count({ where: { taskId: id } })
  if (claimCount >= task.maxTesters) {
    return NextResponse.json({ error: 'No spots remaining' }, { status: 409 })
  }

  try {
    const claim = await prisma.taskClaim.create({
      data: {
        taskId: id,
        userId: user!.id,
      },
    })

    // Update task status to IN_PROGRESS if first claim
    if (task.status === 'OPEN') {
      await prisma.task.update({
        where: { id },
        data: { status: 'IN_PROGRESS' },
      })
    }

    return NextResponse.json({ claimId: claim.id })
  } catch (err: unknown) {
    // Unique constraint violation → user already claimed
    if (err && typeof err === 'object' && 'code' in err && (err as { code: string }).code === 'P2002') {
      return NextResponse.json({ error: 'You have already claimed this task' }, { status: 409 })
    }
    throw err
  }
}
