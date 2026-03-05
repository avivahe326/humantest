import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/require-auth'
import { prisma } from '@/lib/prisma'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error } = await requireAuth()
  if (error) return error

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    select: { reportStatus: true, report: true, creatorId: true, updatedAt: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  const isCreator = task.creatorId === user!.id

  const response: Record<string, unknown> = {
    reportStatus: task.reportStatus,
    hasReport: task.report !== null,
    updatedAt: task.updatedAt.toISOString(),
  }

  // Include report content when completed so frontend can display immediately
  if (task.report !== null) {
    response.report = task.report
  }

  // Include per-feedback analysis status for the task creator
  if (isCreator) {
    const feedbacks = await prisma.feedback.findMany({
      where: { taskId: id },
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    response.feedbacks = feedbacks.map(fb => ({
      id: fb.id,
      testerName: fb.user.name || 'Anonymous',
      mediaAnalysisStatus: fb.mediaAnalysisStatus,
      hasMediaAnalysis: fb.mediaAnalysis !== null,
    }))
  }

  return NextResponse.json(response)
}
