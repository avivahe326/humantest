import { prisma } from '@/lib/prisma'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

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

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Available Tests</h1>
        <Link href="/tasks/create">
          <Button>Create Test</Button>
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          No tests available yet. Be the first to create one!
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map(task => {
            const spotsRemaining = task.maxTesters - task._count.claims
            let hostname = ''
            try { hostname = new URL(task.targetUrl).hostname } catch {}

            return (
              <Link key={task.id} href={`/tasks/${task.id}`}>
                <Card className="transition-shadow hover:shadow-lg h-full">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg leading-tight">{task.title}</CardTitle>
                    {hostname && (
                      <p className="text-sm text-muted-foreground">{hostname}</p>
                    )}
                  </CardHeader>
                  <CardContent>
                    {task.focus && (
                      <p className="mb-3 text-sm text-muted-foreground line-clamp-2">{task.focus}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="secondary">{task.rewardPerTester} credits</Badge>
                      <Badge variant="outline">~{task.estimatedMinutes} min</Badge>
                      <Badge variant={spotsRemaining > 0 ? 'default' : 'destructive'}>
                        {spotsRemaining > 0 ? `${spotsRemaining} spots left` : 'Full'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex justify-center gap-2">
          {page > 1 && (
            <Link href={`/tasks?page=${page - 1}`}>
              <Button variant="outline" size="sm">Previous</Button>
            </Link>
          )}
          <span className="flex items-center px-3 text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link href={`/tasks?page=${page + 1}`}>
              <Button variant="outline" size="sm">Next</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
