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

interface FeedbackData {
  id: string
  testerName: string
  createdAt: string
  screenRecUrl: string | null
  audioUrl: string | null
  rawData: Record<string, unknown> | null
  textFeedback: string | null
  mediaAnalysis: string | null
  mediaAnalysisStatus: string | null
}

interface FeedbackStatusInfo {
  id: string
  testerName: string
  mediaAnalysisStatus: string | null
  hasMediaAnalysis: boolean
}

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
  feedbacks?: FeedbackData[]
}

export function TaskDetailClient({ task, isLoggedIn, isCreator, userClaim, feedbacks: initialFeedbacks = [] }: TaskDetailProps) {
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState('')
  const [reportStatus, setReportStatus] = useState(task.reportStatus)
  const [progress, setProgress] = useState(0)
  const [feedbackStatuses, setFeedbackStatuses] = useState<FeedbackStatusInfo[]>([])
  const [expandedFeedbacks, setExpandedFeedbacks] = useState<Set<string>>(new Set())
  const startTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number>(0)

  let hostname = ''
  try { hostname = new URL(task.targetUrl).hostname } catch {}

  const isGenerating = reportStatus === 'GENERATING'

  // Simulated progress: 90 * (1 - e^(-t/120)) — slower curve for media analysis
  const updateProgress = useCallback(() => {
    if (!startTimeRef.current) return
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const simulated = 90 * (1 - Math.exp(-elapsed / 120))
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

  // Poll report status with per-feedback info
  useEffect(() => {
    if (!isGenerating) return
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/report-status`)
        if (!res.ok) return
        const data = await res.json()

        if (data.feedbacks) {
          setFeedbackStatuses(data.feedbacks)
        }

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

  function toggleFeedback(id: string) {
    setExpandedFeedbacks(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  async function handleGenerateReport(regenerate = false) {
    setGeneratingReport(true)
    setError('')
    try {
      const url = regenerate
        ? `/api/tasks/${task.id}/generate-report?regenerate=1`
        : `/api/tasks/${task.id}/generate-report`
      const res = await fetch(url, { method: 'POST' })
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

  // Compute analysis progress from feedback statuses
  const analysisCompleted = feedbackStatuses.filter(f => f.mediaAnalysisStatus === 'COMPLETED' || f.mediaAnalysisStatus === 'FAILED').length
  const analysisTotal = feedbackStatuses.length
  const allAnalysesDone = analysisTotal > 0 && analysisCompleted === analysisTotal

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
              <Button onClick={() => handleGenerateReport()} disabled={generatingReport} variant="secondary">
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
              <p className="text-sm font-medium">
                {allAnalysesDone
                  ? 'Phase 2: Generating aggregate report...'
                  : analysisTotal > 0
                    ? `Phase 1: Analyzing recordings (${analysisCompleted}/${analysisTotal})...`
                    : 'Generating AI Report...'
                }
              </p>
              <span className="text-sm text-muted-foreground">{progress}%</span>
            </div>
            <Progress value={progress} />

            {/* Per-tester analysis status */}
            {feedbackStatuses.length > 0 && (
              <div className="space-y-1 pt-2">
                {feedbackStatuses.map(fb => (
                  <div key={fb.id} className="flex items-center gap-2 text-xs">
                    {fb.mediaAnalysisStatus === 'COMPLETED' ? (
                      <span className="text-green-500">&#10003;</span>
                    ) : fb.mediaAnalysisStatus === 'FAILED' ? (
                      <span className="text-red-500">&#10007;</span>
                    ) : fb.mediaAnalysisStatus === 'GENERATING' ? (
                      <span className="text-yellow-500 animate-pulse">&#9679;</span>
                    ) : (
                      <span className="text-muted-foreground">&#9675;</span>
                    )}
                    <span className="text-muted-foreground">{fb.testerName}</span>
                    <span className="text-muted-foreground">
                      {fb.mediaAnalysisStatus === 'COMPLETED' ? '— analysis complete'
                        : fb.mediaAnalysisStatus === 'FAILED' ? '— analysis failed'
                        : fb.mediaAnalysisStatus === 'GENERATING' ? '— analyzing...'
                        : '— pending'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Video analysis may take several minutes. You can leave this page and come back.
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
              <Button onClick={() => handleGenerateReport()} disabled={generatingReport} variant="secondary" size="sm">
                {generatingReport ? 'Starting...' : 'Retry Report Generation'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Per-tester submissions (creator only) */}
      {isCreator && initialFeedbacks.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Tester Submissions ({initialFeedbacks.length})</h2>

          {initialFeedbacks.map((fb) => {
            const raw = fb.rawData as { firstImpression?: string; steps?: { id: string; answer: string }[]; nps?: number; best?: string; worst?: string } | null
            const isExpanded = expandedFeedbacks.has(fb.id)

            return (
              <Card key={fb.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{fb.testerName}</CardTitle>
                    <div className="flex items-center gap-2">
                      {raw?.nps !== undefined && (
                        <Badge variant={raw.nps >= 8 ? 'default' : raw.nps >= 5 ? 'secondary' : 'destructive'}>
                          NPS: {raw.nps}/10
                        </Badge>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(fb.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Media players */}
                  {(fb.screenRecUrl || fb.audioUrl) && (
                    <div className="space-y-3">
                      {fb.screenRecUrl && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Screen Recording</p>
                          <video
                            controls
                            preload="metadata"
                            className="w-full rounded-md border"
                            src={fb.screenRecUrl}
                          />
                        </div>
                      )}
                      {fb.audioUrl && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground mb-1">Audio</p>
                          <audio controls preload="metadata" className="w-full" src={fb.audioUrl} />
                        </div>
                      )}
                    </div>
                  )}

                  {/* Text feedback */}
                  {raw && (
                    <div className="space-y-2">
                      {raw.firstImpression && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">First Impression</p>
                          <p className="text-sm">{raw.firstImpression}</p>
                        </div>
                      )}
                      {raw.best && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Best Part</p>
                          <p className="text-sm">{raw.best}</p>
                        </div>
                      )}
                      {raw.worst && (
                        <div>
                          <p className="text-xs font-medium text-muted-foreground">Worst Part</p>
                          <p className="text-sm">{raw.worst}</p>
                        </div>
                      )}

                      {/* Collapsible steps */}
                      {raw.steps && raw.steps.length > 0 && (
                        <div>
                          <button
                            onClick={() => toggleFeedback(fb.id)}
                            className="text-xs font-medium text-muted-foreground hover:text-foreground flex items-center gap-1"
                          >
                            <span>{isExpanded ? '\u25BC' : '\u25B6'}</span>
                            Task Steps ({raw.steps.length})
                          </button>
                          {isExpanded && (
                            <div className="mt-1 space-y-1 pl-3 border-l-2 border-muted">
                              {raw.steps.map(s => (
                                <div key={s.id} className="text-sm">
                                  <span className="text-muted-foreground">Step {s.id}:</span> {s.answer}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {fb.textFeedback && !raw && (
                    <div>
                      <p className="text-xs font-medium text-muted-foreground">Feedback</p>
                      <p className="text-sm">{fb.textFeedback}</p>
                    </div>
                  )}

                  {/* AI media analysis */}
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2">AI Video Analysis</p>
                    {fb.mediaAnalysisStatus === 'GENERATING' ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="animate-pulse">&#9679;</span>
                        Analyzing video and audio...
                      </div>
                    ) : fb.mediaAnalysisStatus === 'COMPLETED' && fb.mediaAnalysis ? (
                      <div className="prose prose-invert prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {fb.mediaAnalysis}
                        </ReactMarkdown>
                      </div>
                    ) : fb.mediaAnalysisStatus === 'FAILED' ? (
                      <p className="text-sm text-red-500">Media analysis failed for this tester.</p>
                    ) : !fb.screenRecUrl && !fb.audioUrl ? (
                      <p className="text-sm text-muted-foreground">No recording submitted</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">Analysis not yet started</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Progress stats */}
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
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Test Report</CardTitle>
              {isCreator && !isGenerating && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleGenerateReport(true)}
                  disabled={generatingReport}
                >
                  {generatingReport ? 'Regenerating...' : 'Regenerate Report'}
                </Button>
              )}
            </div>
          </CardHeader>
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
