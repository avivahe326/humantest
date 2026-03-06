'use client'

import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

interface MyTasksClientProps {
  claims: {
    id: string
    status: string
    claimedAt: string
    task: { id: string; title: string; status: string; rewardPerTester: number }
  }[]
  createdTasks: {
    id: string
    title: string
    status: string
    maxTesters: number
    claimedCount: number
    submittedCount: number
    report: boolean
    createdAt: string
  }[]
}

export function MyTasksClient({ claims, createdTasks }: MyTasksClientProps) {
  const activeClaims = claims.filter(c => c.status === 'IN_PROGRESS')
  const completedClaims = claims.filter(c => c.status === 'SUBMITTED')
  const { t } = useTranslation()

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">{t('myTasks.title')}</h1>

      <Tabs defaultValue="testing">
        <TabsList>
          <TabsTrigger value="testing">{t('myTasks.testing', { count: activeClaims.length })}</TabsTrigger>
          <TabsTrigger value="completed">{t('myTasks.completed', { count: completedClaims.length })}</TabsTrigger>
          <TabsTrigger value="created">{t('myTasks.created', { count: createdTasks.length })}</TabsTrigger>
        </TabsList>

        <TabsContent value="testing" className="mt-4 space-y-3">
          {activeClaims.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{t('myTasks.noInProgress')}</p>
              <Link href="/tasks"><Button className="mt-4">{t('myTasks.browseTests')}</Button></Link>
            </div>
          ) : (
            activeClaims.map(claim => (
              <Card key={claim.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <Link href={`/tasks/${claim.task.id}`} className="font-medium hover:underline">
                      {claim.task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t('myTasks.claimedOn', { date: new Date(claim.claimedAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{t('myTasks.inProgress')}</Badge>
                    {claim.task.status !== 'COMPLETED' && claim.task.status !== 'CANCELLED' && (
                      <Link href={`/tasks/${claim.task.id}/submit`}>
                        <Button size="sm">{t('myTasks.submit')}</Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="completed" className="mt-4 space-y-3">
          {completedClaims.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{t('myTasks.noCompleted')}</p>
            </div>
          ) : (
            completedClaims.map(claim => (
              <Card key={claim.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <Link href={`/tasks/${claim.task.id}`} className="font-medium hover:underline">
                      {claim.task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t('myTasks.claimedOn', { date: new Date(claim.claimedAt).toLocaleDateString() })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="secondary">SUBMITTED</Badge>
                    <span className="text-sm text-muted-foreground">+{claim.task.rewardPerTester} credits</span>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="created" className="mt-4 space-y-3">
          {createdTasks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">{t('myTasks.noCreated')}</p>
              <Link href="/tasks/create"><Button className="mt-4">{t('myTasks.launchFirst')}</Button></Link>
            </div>
          ) : (
            createdTasks.map(task => (
              <Card key={task.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <Link href={`/tasks/${task.id}`} className="font-medium hover:underline">
                      {task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t('myTasks.submittedOf', { submitted: task.submittedCount, max: task.maxTesters })}
                      {' · '}
                      {new Date(task.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{task.status}</Badge>
                    {task.report && (
                      <Link href={`/tasks/${task.id}`}>
                        <Badge variant="secondary">{t('myTasks.reportReady')}</Badge>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
