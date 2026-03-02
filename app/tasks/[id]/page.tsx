import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { TaskDetailClient } from './task-detail-client'

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const session = await getServerSession(authOptions)

  const task = await prisma.task.findUnique({
    where: { id },
    include: {
      creator: { select: { id: true, name: true } },
      _count: { select: { claims: true, feedbacks: true } },
      claims: session ? {
        where: { userId: session.user.id },
        select: { id: true, status: true },
      } : false,
    },
  })

  if (!task) notFound()

  const userClaim = session ? task.claims?.[0] : null
  const isCreator = session?.user?.id === task.creatorId
  const spotsRemaining = task.maxTesters - task._count.claims

  return (
    <TaskDetailClient
      task={{
        id: task.id,
        title: task.title,
        description: task.description,
        targetUrl: task.targetUrl,
        focus: task.focus,
        requirements: task.requirements as Record<string, unknown> | null,
        maxTesters: task.maxTesters,
        rewardPerTester: task.rewardPerTester,
        estimatedMinutes: task.estimatedMinutes,
        status: task.status,
        report: task.report,
        createdAt: task.createdAt.toISOString(),
        claimedCount: task._count.claims,
        submittedCount: task._count.feedbacks,
        spotsRemaining,
      }}
      isLoggedIn={!!session}
      isCreator={isCreator}
      userClaim={userClaim ? { id: userClaim.id, status: userClaim.status } : null}
    />
  )
}
