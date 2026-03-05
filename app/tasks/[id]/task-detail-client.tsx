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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

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

function FixedVideo({ src, className }: { src: string; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = ref.current
    if (!video) return
    const fix = () => {
      if (video.duration === Infinity || isNaN(video.duration)) {
        video.currentTime = 1e10
        video.addEventListener('timeupdate', function handler() {
          video.removeEventListener('timeupdate', handler)
          video.currentTime = 0
        })
      }
    }
    video.addEventListener('loadedmetadata', fix)
    return () => video.removeEventListener('loadedmetadata', fix)
  }, [])
  return <video ref={ref} controls preload="metadata" playsInline className={className} src={src} />
}

function SyncedVideoAudio({ videoSrc, audioSrc }: { videoSrc: string; audioSrc: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)

  useEffect(() => {
    const video = videoRef.current
    const audio = audioRef.current
    if (!video || !audio) return

    // Fix webm missing duration: seek to a huge time to force browser to calculate it
    const fixDuration = () => {
      if (video.duration === Infinity || isNaN(video.duration)) {
        video.currentTime = 1e10
        video.addEventListener('timeupdate', function handler() {
          video.removeEventListener('timeupdate', handler)
          video.currentTime = 0
        })
      }
    }
    video.addEventListener('loadedmetadata', fixDuration)

    const syncAudio = () => {
      const timeDiff = Math.abs(video.currentTime - audio.currentTime)
      if (timeDiff > 0.3) {
        audio.currentTime = video.currentTime
      }
    }

    const onPlay = () => {
      audio.currentTime = video.currentTime
      audio.play().catch(() => {})
    }
    const onPause = () => audio.pause()
    const onSeeking = () => {
      audio.currentTime = video.currentTime
    }
    const onTimeUpdate = () => syncAudio()
    const onVolumeChange = () => {
      audio.volume = video.volume
      audio.muted = video.muted
    }

    video.addEventListener('play', onPlay)
    video.addEventListener('pause', onPause)
    video.addEventListener('seeking', onSeeking)
    video.addEventListener('timeupdate', onTimeUpdate)
    video.addEventListener('volumechange', onVolumeChange)

    return () => {
      video.removeEventListener('loadedmetadata', fixDuration)
      video.removeEventListener('play', onPlay)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('seeking', onSeeking)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('volumechange', onVolumeChange)
    }
  }, [])

  return (
    <div>
      <video
        ref={videoRef}
        controls
        preload="metadata"
        className="w-full rounded-lg border"
        src={videoSrc}
        playsInline
      />
      <audio ref={audioRef} preload="metadata" src={audioSrc} className="hidden" />
    </div>
  )
}

export function TaskDetailClient({ task, isLoggedIn, isCreator, userClaim, feedbacks: initialFeedbacks = [] }: TaskDetailProps) {
  const router = useRouter()
  const [claiming, setClaiming] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [generatingReport, setGeneratingReport] = useState(false)
  const [error, setError] = useState('')
  const [reportStatus, setReportStatus] = useState(task.reportStatus)
  const [report, setReport] = useState(task.report)
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
      // If startTime not set yet, use now (will be corrected by first poll)
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now()
      }
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

    // Immediately fetch to get server updatedAt for accurate progress
    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/report-status`)
        if (!res.ok) return
        const data = await res.json()

        // Use server updatedAt to set accurate start time
        if (data.updatedAt && data.reportStatus === 'GENERATING') {
          startTimeRef.current = new Date(data.updatedAt).getTime()
        }

        if (data.feedbacks) {
          setFeedbackStatuses(data.feedbacks)
        }

        if (data.reportStatus !== 'GENERATING') {
          setReportStatus(data.reportStatus)
          if (data.hasReport && data.report) {
            setProgress(100)
            setReport(data.report)
          }
        }
      } catch { /* ignore */ }
    }

    fetchStatus()
    const interval = setInterval(fetchStatus, 3000)
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
    if (regenerate) {
      setReport(null)
      setReportStatus('GENERATING')
      setProgress(0)
    }
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

  const showTabs = report || isGenerating || reportStatus === 'FAILED' || (isCreator && initialFeedbacks.length > 0)

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
            {task.submittedCount >= 1 && !report && !isGenerating && reportStatus !== 'GENERATING' && (
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

      {/* Tabbed content: Report + Submissions */}
      {showTabs && (
        <Tabs defaultValue="report" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="report" className="flex-1">Test Report</TabsTrigger>
            {isCreator && initialFeedbacks.length > 0 && (
              <TabsTrigger value="submissions" className="flex-1">
                Submissions ({initialFeedbacks.length})
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="report" className="space-y-4 mt-4">
            {/* Report generation progress */}
            {isGenerating && !report && (
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
            {reportStatus === 'FAILED' && !report && (
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

            {/* Report display */}
            {report && (
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
                    {report}
                  </ReactMarkdown>
                </CardContent>
              </Card>
            )}

            {!report && !isGenerating && !generatingReport && reportStatus !== 'FAILED' && (
              <p className="text-sm text-muted-foreground text-center py-8">No report generated yet.</p>
            )}
          </TabsContent>

          {isCreator && initialFeedbacks.length > 0 && (
            <TabsContent value="submissions" className="space-y-3 mt-4">
              {initialFeedbacks.map((fb) => {
                const raw = fb.rawData as { firstImpression?: string; steps?: { id: string; answer: string }[]; nps?: number; best?: string; worst?: string } | null
                const isExpanded = expandedFeedbacks.has(fb.id)

                return (
                  <Collapsible key={fb.id} open={isExpanded} onOpenChange={() => toggleFeedback(fb.id)}>
                    <Card>
                      <CollapsibleTrigger asChild>
                        <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <span className="text-sm transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>&#9654;</span>
                              <CardTitle className="text-base">{fb.testerName}</CardTitle>
                            </div>
                            <div className="flex items-center gap-2">
                              {raw?.nps !== undefined && (
                                <Badge variant={raw.nps >= 8 ? 'default' : raw.nps >= 5 ? 'secondary' : 'destructive'}>
                                  NPS: {raw.nps}/10
                                </Badge>
                              )}
                              {(fb.screenRecUrl || fb.audioUrl) && (
                                <Badge variant="outline" className="text-xs">
                                  {fb.screenRecUrl && fb.audioUrl ? 'Video + Audio' : fb.screenRecUrl ? 'Video' : 'Audio'}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {new Date(fb.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        </CardHeader>
                      </CollapsibleTrigger>

                      <CollapsibleContent>
                        <CardContent className="space-y-4 pt-0">
                          {/* Media player — video with synced audio overlay */}
                          {fb.screenRecUrl && fb.audioUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Screen Recording + Audio</p>
                              <SyncedVideoAudio videoSrc={fb.screenRecUrl} audioSrc={fb.audioUrl} />
                            </div>
                          ) : fb.screenRecUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Screen Recording</p>
                              <FixedVideo src={fb.screenRecUrl} className="w-full rounded-lg border" />
                            </div>
                          ) : fb.audioUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Audio Feedback</p>
                              <audio controls preload="metadata" className="w-full" src={fb.audioUrl} />
                            </div>
                          ) : null}

                          {/* Text feedback */}
                          <div className="space-y-2">
                            {raw?.firstImpression && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">First Impression</p>
                                <p className="text-sm">{raw.firstImpression}</p>
                              </div>
                            )}
                            {raw?.best && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Best Part</p>
                                <p className="text-sm">{raw.best}</p>
                              </div>
                            )}
                            {raw?.worst && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Worst Part</p>
                                <p className="text-sm">{raw.worst}</p>
                              </div>
                            )}
                            {raw?.steps && raw.steps.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Task Steps</p>
                                {raw.steps.map(s => (
                                  <p key={s.id} className="text-sm">Step {s.id}: {s.answer}</p>
                                ))}
                              </div>
                            )}
                            {fb.textFeedback && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">Additional Feedback</p>
                                <p className="text-sm">{fb.textFeedback}</p>
                              </div>
                            )}
                          </div>

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
                      </CollapsibleContent>
                    </Card>
                  </Collapsible>
                )
              })}
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  )
}
