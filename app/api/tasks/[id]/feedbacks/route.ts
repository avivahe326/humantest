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
    select: { creatorId: true },
  })

  if (!task) {
    return NextResponse.json({ error: 'Task not found' }, { status: 404 })
  }

  if (task.creatorId !== user!.id) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  }

  const feedbacks = await prisma.feedback.findMany({
    where: { taskId: id },
    include: { user: { select: { name: true } } },
    orderBy: { createdAt: 'asc' },
  })

  const result = feedbacks.map(fb => ({
    id: fb.id,
    testerName: fb.user.name || 'Anonymous',
    createdAt: fb.createdAt.toISOString(),
    screenRecUrl: fb.screenRecUrl,
    audioUrl: fb.audioUrl,
    rawData: fb.rawData,
    textFeedback: fb.textFeedback,
    mediaAnalysis: fb.mediaAnalysis,
    mediaAnalysisStatus: fb.mediaAnalysisStatus,
  }))

  return NextResponse.json(result)
}
