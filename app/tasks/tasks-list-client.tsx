'use client'

import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

interface TaskItem {
  id: string
  title: string
  targetUrl: string
  focus: string | null
  estimatedMinutes: number
  maxTesters: number
  claimsCount: number
}

interface TasksListClientProps {
  tasks: TaskItem[]
  page: number
  totalPages: number
}

export function TasksListClient({ tasks, page, totalPages }: TasksListClientProps) {
  const { t } = useTranslation()

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('tasks.availableTests')}</h1>
        <Link href="/tasks/create">
          <Button>{t('tasks.createTest')}</Button>
        </Link>
      </div>

      {tasks.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {t('tasks.noTests')}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {tasks.map(task => {
            const spotsRemaining = task.maxTesters - task.claimsCount
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
                      <Badge variant="outline">{t('tasks.estMinutes', { count: task.estimatedMinutes })}</Badge>
                      <Badge variant={spotsRemaining > 0 ? 'default' : 'destructive'}>
                        {spotsRemaining > 0 ? t('tasks.spotsLeft', { count: spotsRemaining }) : t('tasks.full')}
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
              <Button variant="outline" size="sm">{t('tasks.previous')}</Button>
            </Link>
          )}
          <span className="flex items-center px-3 text-sm text-muted-foreground">
            {t('tasks.pageOf', { page, total: totalPages })}
          </span>
          {page < totalPages && (
            <Link href={`/tasks?page=${page + 1}`}>
              <Button variant="outline" size="sm">{t('tasks.next')}</Button>
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
