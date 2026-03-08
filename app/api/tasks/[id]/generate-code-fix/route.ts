import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'
import { startCodeFixGeneration } from '@/lib/ai-report'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    select: {
      creatorId: true,
      report: true,
      repoUrl: true,
      codeFixStatus: true,
    },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== user!.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  if (!task.report) {
    return NextResponse.json({ error: 'Report must be generated first' }, { status: 400 })
  }

  if (!task.repoUrl) {
    return NextResponse.json({ error: 'No repository URL configured for this task' }, { status: 400 })
  }

  if (task.codeFixStatus === 'GENERATING') {
    return NextResponse.json({ error: 'Code fix generation already in progress' }, { status: 409 })
  }

  startCodeFixGeneration(id) // fire-and-forget

  return NextResponse.json({ started: true })
}
