import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { MyTasksClient } from './my-tasks-client'

export default async function MyTasksPage() {
  const session = await getServerSession(authOptions)
  if (!session) redirect('/login')

  const [claims, createdTasks] = await Promise.all([
    prisma.taskClaim.findMany({
      where: { userId: session.user.id },
      include: {
        task: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { claimedAt: 'desc' },
    }),
    prisma.task.findMany({
      where: { creatorId: session.user.id },
      include: {
        _count: { select: { claims: true, feedbacks: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
  ])

  return (
    <MyTasksClient
      claims={claims.map(c => ({
        id: c.id,
        status: c.status,
        claimedAt: c.claimedAt.toISOString(),
        task: c.task,
      }))}
      createdTasks={createdTasks.map(t => ({
        id: t.id,
        title: t.title,
        status: t.status,
        maxTesters: t.maxTesters,
        claimedCount: t._count.claims,
        submittedCount: t._count.feedbacks,
        report: !!t.report,
        createdAt: t.createdAt.toISOString(),
      }))}
    />
  )
}
