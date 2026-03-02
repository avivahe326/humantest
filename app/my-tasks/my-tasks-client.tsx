'use client'

import Link from 'next/link'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

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
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">My Tasks</h1>

      <Tabs defaultValue="testing">
        <TabsList>
          <TabsTrigger value="testing">Testing ({claims.length})</TabsTrigger>
          <TabsTrigger value="created">Created ({createdTasks.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="testing" className="mt-4 space-y-3">
          {claims.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No tests claimed yet.</p>
              <Link href="/tasks"><Button className="mt-4">Browse available tests</Button></Link>
            </div>
          ) : (
            claims.map(claim => (
              <Card key={claim.id}>
                <CardContent className="flex items-center justify-between py-4">
                  <div>
                    <Link href={`/tasks/${claim.task.id}`} className="font-medium hover:underline">
                      {claim.task.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      Claimed {new Date(claim.claimedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={claim.status === 'SUBMITTED' ? 'secondary' : 'default'}>
                      {claim.status}
                    </Badge>
                    {claim.status === 'IN_PROGRESS' && claim.task.status !== 'COMPLETED' && claim.task.status !== 'CANCELLED' && (
                      <Link href={`/tasks/${claim.task.id}/submit`}>
                        <Button size="sm">Submit</Button>
                      </Link>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="created" className="mt-4 space-y-3">
          {createdTasks.length === 0 ? (
            <div className="py-12 text-center">
              <p className="text-muted-foreground">No tests created yet.</p>
              <Link href="/tasks/create"><Button className="mt-4">Launch your first test</Button></Link>
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
                      {task.submittedCount}/{task.maxTesters} submitted
                      {' · '}
                      {new Date(task.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge>{task.status}</Badge>
                    {task.report && (
                      <Link href={`/tasks/${task.id}`}>
                        <Badge variant="secondary">Report ready</Badge>
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
