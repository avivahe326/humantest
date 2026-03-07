import { prisma } from '@/lib/prisma'
import { TasksListClient } from './tasks-list-client'

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page: pageStr } = await searchParams
  const page = Math.max(1, parseInt(pageStr || '1'))
  const limit = 20
  const skip = (page - 1) * limit

  const [tasks, total] = await Promise.all([
    prisma.task.findMany({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] } },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        _count: {
          select: { claims: true, feedbacks: true },
        },
      },
    }),
    prisma.task.count({ where: { status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
  ])

  const totalPages = Math.ceil(total / limit)

  const serializedTasks = tasks.map(task => ({
    id: task.id,
    title: task.title,
    targetUrl: task.targetUrl,
    focus: task.focus,
    estimatedMinutes: task.estimatedMinutes,
    maxTesters: task.maxTesters,
    claimsCount: task._count.claims,
  }))

  return (
    <TasksListClient
      tasks={serializedTasks}
      page={page}
      totalPages={totalPages}
    />
  )
}
