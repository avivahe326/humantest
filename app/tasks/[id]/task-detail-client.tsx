'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface TaskDetailProps {
  task: {
    id: string
    title: string
    description: string | null
    targetUrl: string
    focus: string | null
    requirements: Record<string, unknown> | null
    maxTesters: number
    rewardPerTester: number
    estimatedMinutes: number
    status: string
    report: string | null
    createdAt: string
    claimedCount: number
    submittedCount: number
    spotsRemaining: number
  }
  isLoggedIn: boolean
  isCreator: boolean
  userClaim: { id: string; status: string } | null
}

export function TaskDetailClient({ task, isLoggedIn, isCreator, userClaim }: TaskDetailProps) {
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState('')

  let hostname = ''
  try { hostname = new URL(task.targetUrl).hostname } catch {}

  async function handleClaim() {
    setClaiming(true)
    setError('')
    try {
      const res = await fetch(`/api/tasks/${task.id}/claim`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to claim')
        return
      }
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setClaiming(false)
    }
  }

  async function handleCancel() {
    if (!confirm('Are you sure you want to cancel this task? Credits for unclaimed slots will be refunded.')) return
    setCancelling(true)
    setError('')
    try {
      const res = await fetch(`/api/tasks/${task.id}/cancel`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to cancel')
        return
      }
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setCancelling(false)
    }
  }

  async function handleGenerateReport() {
    setGeneratingReport(true)
    setError('')
    try {
      const res = await fetch(`/api/tasks/${task.id}/generate-report`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to generate report')
        return
      }
      router.refresh()
    } catch {
      setError('Something went wrong')
    } finally {
      setGeneratingReport(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{task.title}</h1>
        <p className="text-sm text-muted-foreground">{hostname}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Badge variant="secondary">{task.rewardPerTester} credits</Badge>
        <Badge variant="outline">~{task.estimatedMinutes} min</Badge>
        <Badge variant={task.spotsRemaining > 0 ? 'default' : 'destructive'}>
          {task.spotsRemaining > 0 ? `${task.spotsRemaining}/${task.maxTesters} spots left` : 'Full'}
        </Badge>
        <Badge>{task.status}</Badge>
      </div>

      {isLoggedIn && (
        <p className="text-sm">
          <strong>URL:</strong>{' '}
          <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            {task.targetUrl}
          </a>
        </p>
      )}

      {task.description && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Description</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{task.description}</p></CardContent>
        </Card>
      )}

      {task.focus && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Focus Area</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{task.focus}</p></CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isLoggedIn && (
          <Link href="/login">
            <Button>Log in to claim</Button>
          </Link>
        )}

        {isLoggedIn && !userClaim && task.spotsRemaining > 0 && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
          <Button onClick={handleClaim} disabled={claiming}>
            {claiming ? 'Claiming...' : 'Claim This Task'}
          </Button>
        )}

        {userClaim?.status === 'IN_PROGRESS' && (
          <div className="flex gap-2">
            <Link href={`/tasks/${task.id}/test`}>
              <Button>开始测试</Button>
            </Link>
            <Link href={`/tasks/${task.id}/submit`}>
              <Button variant="outline">直接提交反馈</Button>
            </Link>
          </div>
        )}

        {userClaim?.status === 'SUBMITTED' && (
          <Badge variant="secondary" className="text-base px-4 py-2">Feedback Submitted</Badge>
        )}

        {isCreator && (task.status === 'OPEN' || task.status === 'IN_PROGRESS') && (
          <>
            {task.submittedCount >= 1 && (
              <Button onClick={handleGenerateReport} disabled={generatingReport} variant="secondary">
                {generatingReport ? 'Generating...' : 'Generate Report Now'}
              </Button>
            )}
            <Button onClick={handleCancel} disabled={cancelling} variant="destructive">
              {cancelling ? 'Cancelling...' : 'Cancel Task'}
            </Button>
          </>
        )}
      </div>

      {/* Progress */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold">{task.claimedCount}</p>
              <p className="text-xs text-muted-foreground">Claimed</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{task.submittedCount}</p>
              <p className="text-xs text-muted-foreground">Submitted</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{task.maxTesters}</p>
              <p className="text-xs text-muted-foreground">Max Testers</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Report display (public for COMPLETED tasks) */}
      {task.report && (
        <Card>
          <CardHeader><CardTitle className="text-lg">Test Report</CardTitle></CardHeader>
          <CardContent className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {task.report}
            </ReactMarkdown>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
