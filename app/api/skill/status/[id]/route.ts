import { NextRequest, NextResponse } from 'next/server'
import { requireApiKey } from '@/lib/require-api-key'
import { prisma } from '@/lib/prisma'
import { withCors, corsOptionsResponse } from '@/lib/cors'

export async function OPTIONS() {
  return corsOptionsResponse()
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, error, isAdminFallback } = await requireApiKey(request, { optional: true })
  if (error) return withCors(error)

  const { id } = await params

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      claims: true,
      feedbacks: true,
    },
  })

  if (!task) {
    return withCors(NextResponse.json({ error: 'Task not found' }, { status: 404 }))
  }

  // Skip ownership check when using admin fallback (no explicit auth)
  if (!isAdminFallback && task.creatorId !== user!.id) {
    return withCors(NextResponse.json({ error: 'Not authorized' }, { status: 403 }))
  }

  const claimedCount = task.claims.length
  const submittedCount = task.feedbacks.length

  return withCors(NextResponse.json({
    taskId: task.id,
    status: task.status,
    title: task.title,
    maxTesters: task.maxTesters,
    claimedCount,
    submittedCount,
    report: task.report,
  }))
}
