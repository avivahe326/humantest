'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

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
    reportStatus: string | null
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
  const [reportStatus, setReportStatus] = useState(task.reportStatus)
  const [progress, setProgress] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number>(0)

  let hostname = ''
  try { hostname = new URL(task.targetUrl).hostname } catch {}

  const isGenerating = reportStatus === 'GENERATING'

  // Simulated progress: 90 * (1 - e^(-t/45))
  const updateProgress = useCallback(() => {
    if (!startTimeRef.current) return
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const simulated = 90 * (1 - Math.exp(-elapsed / 45))
    setProgress(Math.round(simulated))
    animFrameRef.current = requestAnimationFrame(updateProgress)
  }, [])

  // Start/stop progress animation
  useEffect(() => {
    if (isGenerating) {
      startTimeRef.current = Date.now()
      animFrameRef.current = requestAnimationFrame(updateProgress)
    } else {
      cancelAnimationFrame(animFrameRef.current)
      startTimeRef.current = null
    }
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [isGenerating, updateProgress])

  // Poll report status
  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/report-status`)
        if (!res.ok) return
        const data = await res.json()
        if (data.reportStatus !== 'GENERATING') {
          setReportStatus(data.reportStatus)
          if (data.hasReport) {
            setProgress(100)
            setTimeout(() => router.refresh(), 500)
          }
        }
      } catch { /* ignore polling errors */ }
    }, 3000)
    return () => clearInterval(interval)
  }, [isGenerating, task.id, router])

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
      const data = await res.json()
      if (!res.ok) {
        if (res.status === 409) {
          // Already generating — just start polling
          setReportStatus('GENERATING')
        } else {
          setError(data.error || 'Failed to generate report')
        }
        return
      }
      setReportStatus('GENERATING')
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
              <Button>Start Testing</Button>
            </Link>
            <Link href={`/tasks/${task.id}/submit`}>
              <Button variant="outline">Submit Feedback Directly</Button>
            </Link>
          </div>
        )}

        {userClaim?.status === 'SUBMITTED' && (
          <Badge variant="secondary" className="text-base px-4 py-2">Feedback Submitted</Badge>
        )}

        {isCreator && task.status !== 'CANCELLED' && (
          <>
            {task.submittedCount >= 1 && !task.report && !isGenerating && reportStatus !== 'GENERATING' && (
              <Button onClick={handleGenerateReport} disabled={generatingReport} variant="secondary">
                {generatingReport ? 'Starting...' : 'Generate Report Now'}
              </Button>
            )}
            {(task.status === 'OPEN' || task.status === 'IN_PROGRESS') && (
              <Button onClick={handleCancel} disabled={cancelling} variant="destructive">
                {cancelling ? 'Cancelling...' : 'Cancel Task'}
              </Button>
            )}
          </>
        )}
      </div>

      {/* Report generation progress */}
      {isGenerating && !task.report && (
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Generating AI Report...</p>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />
            <p className="text-xs text-muted-foreground">
              This usually takes 30-90 seconds. You can leave this page and come back.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Report generation failed */}
      {reportStatus === 'FAILED' && !task.report && (
        <Card className="border-red-500/50">
          <CardContent className="pt-6 space-y-3">
            <p className="text-sm text-red-500">Report generation failed. Please try again.</p>
            {isCreator && (
              <Button onClick={handleGenerateReport} disabled={generatingReport} variant="secondary" size="sm">
                {generatingReport ? 'Starting...' : 'Retry Report Generation'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

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
