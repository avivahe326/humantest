import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = Math.max(1, parseInt(searchParams.get('page') || '1'))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20')))
  const skip = (page - 1) * limit

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: {
          select: {
            claims: true,
            feedbacks: true,
          },
        },
      },
    }),
    prisma.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ])

  return NextResponse.json({
    tasks: tasks.map(t => ({
      id: t.id,
      title: t.title,
      targetUrl: t.targetUrl,
      focus: t.focus,
      rewardPerTester: t.rewardPerTester,
      estimatedMinutes: t.estimatedMinutes,
      maxTesters: t.maxTesters,
      status: t.status,
      claimedCount: t._count.claims,
      submittedCount: t._count.feedbacks,
      spotsRemaining: t.maxTesters - t._count.claims,
      createdAt: t.createdAt,
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit),
  })
}
