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
import { useTranslation } from '@/lib/i18n'

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
    codeFixStatus: string | null
    codeFixPrUrl: string | null
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
  const [codeFixStatus, setCodeFixStatus] = useState(task.codeFixStatus)
  const [codeFixPrUrl, setCodeFixPrUrl] = useState(task.codeFixPrUrl)
  const [progress, setProgress] = useState(0)
  const [feedbackStatuses, setFeedbackStatuses] = useState<FeedbackStatusInfo[]>([])
  const [expandedFeedbacks, setExpandedFeedbacks] = useState<Set<string>>(new Set())
  const startTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number>(0)
  const { t } = useTranslation()

  let hostname = ''
  try { hostname = new URL(task.targetUrl).hostname } catch {}

  const isGenerating = reportStatus === 'GENERATING'
  const isCodeFixing = codeFixStatus === 'GENERATING'

  const updateProgress = useCallback(() => {
    if (!startTimeRef.current) return
    const elapsed = (Date.now() - startTimeRef.current) / 1000
    const simulated = 90 * (1 - Math.exp(-elapsed / 120))
    setProgress(Math.round(simulated))
    animFrameRef.current = requestAnimationFrame(updateProgress)
  }, [])

  useEffect(() => {
    if (isGenerating) {
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

  useEffect(() => {
    if (!isGenerating && !isCodeFixing) return

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/tasks/${task.id}/report-status`)
        if (!res.ok) return
        const data = await res.json()

        if (data.updatedAt && data.reportStatus === 'GENERATING') {
          startTimeRef.current = new Date(data.updatedAt).getTime()
        }

        if (data.feedbacks) {
          setFeedbackStatuses(data.feedbacks)
        }

        if (data.codeFixStatus) {
          setCodeFixStatus(data.codeFixStatus)
        }
        if (data.codeFixPrUrl) {
          setCodeFixPrUrl(data.codeFixPrUrl)
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
  }, [isGenerating, isCodeFixing, task.id, router])

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
      setError(t('common.somethingWrong'))
    } finally {
      setClaiming(false)
    }
  }

  async function handleCancel() {
    if (!confirm(t('taskDetail.cancelConfirm'))) return
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
      setError(t('common.somethingWrong'))
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
          setReportStatus('GENERATING')
        } else {
          setError(data.error || 'Failed to generate report')
        }
        return
      }
      setReportStatus('GENERATING')
    } catch {
      setError(t('common.somethingWrong'))
    } finally {
      setGeneratingReport(false)
    }
  }

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
        <Badge variant="secondary">{t('tasks.credits', { count: task.rewardPerTester })}</Badge>
        <Badge variant="outline">{t('tasks.estMinutes', { count: task.estimatedMinutes })}</Badge>
        <Badge variant={task.spotsRemaining > 0 ? 'default' : 'destructive'}>
          {task.spotsRemaining > 0 ? t('taskDetail.spotsLeft', { remaining: task.spotsRemaining, max: task.maxTesters }) : t('tasks.full')}
        </Badge>
        <Badge>{task.status}</Badge>
      </div>

      {isLoggedIn && (
        <p className="text-sm">
          <strong>{t('taskDetail.url')}</strong>{' '}
          <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
            {task.targetUrl}
          </a>
        </p>
      )}

      {task.description && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('taskDetail.description')}</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{task.description}</p></CardContent>
        </Card>
      )}

      {task.focus && (
        <Card>
          <CardHeader><CardTitle className="text-lg">{t('taskDetail.focusArea')}</CardTitle></CardHeader>
          <CardContent><p className="text-sm">{task.focus}</p></CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Action buttons */}
      <div className="flex gap-3">
        {!isLoggedIn && (
          <Link href="/login">
            <Button>{t('taskDetail.logInToClaim')}</Button>
          </Link>
        )}

        {isLoggedIn && !userClaim && task.spotsRemaining > 0 && task.status !== 'COMPLETED' && task.status !== 'CANCELLED' && (
          <Button onClick={handleClaim} disabled={claiming}>
            {claiming ? t('taskDetail.claiming') : t('taskDetail.claimTask')}
          </Button>
        )}

        {userClaim?.status === 'IN_PROGRESS' && (
          <div className="flex gap-2">
            <Link href={`/tasks/${task.id}/test`}>
              <Button>{t('taskDetail.startTesting')}</Button>
            </Link>
            <Link href={`/tasks/${task.id}/submit`}>
              <Button variant="outline">{t('taskDetail.submitDirectly')}</Button>
            </Link>
          </div>
        )}

        {userClaim?.status === 'SUBMITTED' && (
          <Badge variant="secondary" className="text-base px-4 py-2">{t('taskDetail.feedbackSubmitted')}</Badge>
        )}

        {isCreator && task.status !== 'CANCELLED' && (
          <>
            {task.submittedCount >= 1 && !report && !isGenerating && reportStatus !== 'GENERATING' && (
              <Button onClick={() => handleGenerateReport()} disabled={generatingReport} variant="secondary">
                {generatingReport ? t('taskDetail.starting') : t('taskDetail.generateReport')}
              </Button>
            )}
            {(task.status === 'OPEN' || task.status === 'IN_PROGRESS') && (
              <Button onClick={handleCancel} disabled={cancelling} variant="destructive">
                {cancelling ? t('taskDetail.cancelling') : t('taskDetail.cancelTask')}
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
              <p className="text-xs text-muted-foreground">{t('taskDetail.claimed')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{task.submittedCount}</p>
              <p className="text-xs text-muted-foreground">{t('taskDetail.submitted')}</p>
            </div>
            <div>
              <p className="text-2xl font-bold">{task.maxTesters}</p>
              <p className="text-xs text-muted-foreground">{t('taskDetail.maxTesters')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabbed content: Report + Submissions */}
      {showTabs && (
        <Tabs defaultValue="report" className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="report" className="flex-1">{t('taskDetail.testReport')}</TabsTrigger>
            {isCreator && initialFeedbacks.length > 0 && (
              <TabsTrigger value="submissions" className="flex-1">
                {t('taskDetail.submissions', { count: initialFeedbacks.length })}
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="report" className="space-y-4 mt-4">
            {isGenerating && !report && (
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">
                      {allAnalysesDone
                        ? t('taskDetail.phase2')
                        : analysisTotal > 0
                          ? t('taskDetail.phase1', { completed: analysisCompleted, total: analysisTotal })
                          : t('taskDetail.generatingReport')
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
                            {fb.mediaAnalysisStatus === 'COMPLETED' ? t('taskDetail.analysisComplete')
                              : fb.mediaAnalysisStatus === 'FAILED' ? t('taskDetail.analysisFailed')
                              : fb.mediaAnalysisStatus === 'GENERATING' ? t('taskDetail.analyzing')
                              : t('taskDetail.pending')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t('taskDetail.videoAnalysisNote')}
                  </p>
                </CardContent>
              </Card>
            )}

            {reportStatus === 'FAILED' && !report && (
              <Card className="border-red-500/50">
                <CardContent className="pt-6 space-y-3">
                  <p className="text-sm text-red-500">{t('taskDetail.reportFailed')}</p>
                  {isCreator && (
                    <Button onClick={() => handleGenerateReport()} disabled={generatingReport} variant="secondary" size="sm">
                      {generatingReport ? t('taskDetail.starting') : t('taskDetail.retryReport')}
                    </Button>
                  )}
                </CardContent>
              </Card>
            )}

            {report && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{t('taskDetail.testReport')}</CardTitle>
                    {isCreator && !isGenerating && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleGenerateReport(true)}
                        disabled={generatingReport}
                      >
                        {generatingReport ? t('taskDetail.regenerating') : t('taskDetail.regenerateReport')}
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

            {/* Code Fix Status */}
            {isCodeFixing && (
              <Card>
                <CardContent className="pt-6 space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-yellow-500 animate-pulse">&#9679;</span>
                    <span>{t('taskDetail.codeFixGenerating')}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{t('taskDetail.codeFixNote')}</p>
                </CardContent>
              </Card>
            )}

            {codeFixStatus === 'FAILED' && (
              <Card className="border-yellow-500/50">
                <CardContent className="pt-6">
                  <p className="text-sm text-yellow-500">{t('taskDetail.codeFixFailed')}</p>
                </CardContent>
              </Card>
            )}

            {codeFixPrUrl && (
              <Card className="border-green-500/50">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <span className="text-green-500">&#10003;</span>
                    <span className="text-sm">
                      {t('taskDetail.codeFixPr')}{' '}
                      <a href={codeFixPrUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-primary">
                        {t('taskDetail.viewPr')}
                      </a>
                    </span>
                  </div>
                </CardContent>
              </Card>
            )}

            {!report && !isGenerating && !generatingReport && reportStatus !== 'FAILED' && (
              <p className="text-sm text-muted-foreground text-center py-8">{t('taskDetail.noReport')}</p>
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
                                  {t('taskDetail.nps', { score: raw.nps })}
                                </Badge>
                              )}
                              {(fb.screenRecUrl || fb.audioUrl) && (
                                <Badge variant="outline" className="text-xs">
                                  {fb.screenRecUrl && fb.audioUrl ? t('taskDetail.videoAudio') : fb.screenRecUrl ? t('taskDetail.video') : t('taskDetail.audio')}
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
                          {fb.screenRecUrl && fb.audioUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{t('taskDetail.screenRecordingAudio')}</p>
                              <SyncedVideoAudio videoSrc={fb.screenRecUrl} audioSrc={fb.audioUrl} />
                            </div>
                          ) : fb.screenRecUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{t('taskDetail.screenRecording')}</p>
                              <FixedVideo src={fb.screenRecUrl} className="w-full rounded-lg border" />
                            </div>
                          ) : fb.audioUrl ? (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">{t('taskDetail.audioFeedback')}</p>
                              <audio controls preload="metadata" className="w-full" src={fb.audioUrl} />
                            </div>
                          ) : null}

                          <div className="space-y-2">
                            {raw?.firstImpression && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{t('taskDetail.firstImpression')}</p>
                                <p className="text-sm">{raw.firstImpression}</p>
                              </div>
                            )}
                            {raw?.best && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{t('taskDetail.bestPart')}</p>
                                <p className="text-sm">{raw.best}</p>
                              </div>
                            )}
                            {raw?.worst && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{t('taskDetail.worstPart')}</p>
                                <p className="text-sm">{raw.worst}</p>
                              </div>
                            )}
                            {raw?.steps && raw.steps.length > 0 && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{t('taskDetail.taskSteps')}</p>
                                {raw.steps.map(s => (
                                  <p key={s.id} className="text-sm">{t('taskDetail.stepAnswer', { id: s.id, answer: s.answer })}</p>
                                ))}
                              </div>
                            )}
                            {fb.textFeedback && (
                              <div>
                                <p className="text-xs font-medium text-muted-foreground">{t('taskDetail.additionalFeedback')}</p>
                                <p className="text-sm">{fb.textFeedback}</p>
                              </div>
                            )}
                          </div>

                          <div className="border-t pt-3">
                            <p className="text-xs font-medium text-muted-foreground mb-2">{t('taskDetail.aiVideoAnalysis')}</p>
                            {fb.mediaAnalysisStatus === 'GENERATING' ? (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <span className="animate-pulse">&#9679;</span>
                                {t('taskDetail.analyzingVideoAudio')}
                              </div>
                            ) : fb.mediaAnalysisStatus === 'COMPLETED' && fb.mediaAnalysis ? (
                              <div className="prose prose-invert prose-sm max-w-none">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                  {fb.mediaAnalysis}
                                </ReactMarkdown>
                              </div>
                            ) : fb.mediaAnalysisStatus === 'FAILED' ? (
                              <p className="text-sm text-red-500">{t('taskDetail.mediaAnalysisFailed')}</p>
                            ) : !fb.screenRecUrl && !fb.audioUrl ? (
                              <p className="text-sm text-muted-foreground">{t('taskDetail.noRecording')}</p>
                            ) : (
                              <p className="text-sm text-muted-foreground">{t('taskDetail.analysisNotStarted')}</p>
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
