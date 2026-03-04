'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { Monitor, Mic, Square, CheckCircle, AlertTriangle, ExternalLink } from 'lucide-react'

interface TestStep {
  id: string
  instruction: string
}

interface TaskInfo {
  title: string
  targetUrl: string
  rewardPerTester: number
  requirements: { steps: TestStep[] } | null
}

type Phase = 'loading' | 'error' | 'ready' | 'recording' | 'uploading' | 'done'

export default function IntegratedTestPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [phase, setPhase] = useState<Phase>('loading')
  const [task, setTask] = useState<TaskInfo | null>(null)
  const [claimId, setClaimId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const uploadTriggeredRef = useRef(false)

  const recorder = useMediaRecorder({
    maxDurationMs: 15 * 60 * 1000,
  })

  // Auth guard
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [authStatus, router])

  // Load task info + claim validation
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function load() {
      try {
        const infoRes = await fetch(`/api/tasks/${taskId}/info`)
        if (!infoRes.ok) {
          if (!cancelled) {
            setErrorMsg(infoRes.status === 404 ? 'Task not found' : 'Failed to load task')
            setPhase('error')
          }
          return
        }
        const taskData = await infoRes.json()
        if (!cancelled) setTask(taskData)

        const claimRes = await fetch(`/api/tasks/${taskId}/my-claim`)
        if (claimRes.ok) {
          const { claimId: existingClaimId } = await claimRes.json()
          if (!cancelled) setClaimId(existingClaimId)
        } else {
          if (!cancelled) {
            setErrorMsg('You have not claimed this task yet. Please go back and claim it first.')
            setPhase('error')
          }
          return
        }

        if (!cancelled) setPhase('ready')
      } catch {
        if (!cancelled) {
          setErrorMsg('Failed to load. Please try again.')
          setPhase('error')
        }
      }
    }

    load()
    return () => { cancelled = true }
  }, [session, taskId])

  // Navigation protection during recording
  useEffect(() => {
    if (phase !== 'recording') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

  // Watch recorder status transitions
  useEffect(() => {
    if (recorder.status === 'recording' && phase !== 'recording') {
      setPhase('recording')
      // Open target website after recording successfully started
      if (task?.targetUrl) {
        window.open(task.targetUrl, '_blank')
      }
    }
    if (recorder.status === 'completed' && phase === 'recording' && !uploadTriggeredRef.current) {
      uploadTriggeredRef.current = true
      handleUpload()
    }
    if (recorder.status === 'done') {
      handleDone()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.status])

  const handleStartRecording = useCallback(async () => {
    await recorder.startRecording()
  }, [recorder])

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
  }, [recorder])

  const handleUpload = useCallback(async () => {
    if (!claimId) return
    setPhase('uploading')
    try {
      await recorder.uploadRecordings(taskId, claimId)
    } catch {
      // Error handled in hook - phase stays at 'uploading', recorder.error = 'upload-failed'
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, claimId])

  const handleDone = useCallback(() => {
    setPhase('done')
    const urls = {
      screenRecUrl: recorder.screenRecUrl,
      audioUrl: recorder.audioUrl,
    }
    try {
      sessionStorage.setItem(`recording-urls-${taskId}`, JSON.stringify(urls))
    } catch {
      const params = new URLSearchParams()
      if (urls.screenRecUrl) params.set('screenRecUrl', urls.screenRecUrl)
      if (urls.audioUrl) params.set('audioUrl', urls.audioUrl)
      setTimeout(() => router.push(`/tasks/${taskId}/submit?${params.toString()}`), 1500)
      return
    }
    setTimeout(() => router.push(`/tasks/${taskId}/submit`), 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, router, recorder.screenRecUrl, recorder.audioUrl])

  const handleSkipUpload = useCallback(() => {
    if (window.confirm('录制将不会被保存，确定跳过？')) {
      router.push(`/tasks/${taskId}/submit`)
    }
  }, [router, taskId])

  const remainingMs = 15 * 60 * 1000 - recorder.duration
  const remainingMin = Math.floor(remainingMs / 60000)
  const durationSec = Math.floor(recorder.duration / 1000)
  const mm = String(Math.floor(durationSec / 60)).padStart(2, '0')
  const ss = String(durationSec % 60).padStart(2, '0')

  if (authStatus === 'loading' || phase === 'loading') {
    return <div className="py-12 text-center">Loading...</div>
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-lg py-12 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-500">{errorMsg}</h1>
        <Button onClick={() => router.push(`/tasks/${taskId}`)}>Back to Task</Button>
      </div>
    )
  }

  // Phase: Ready
  if (phase === 'ready' && task) {
    return (
      <div className="mx-auto max-w-lg py-12 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{task.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-sm text-muted-foreground">
              Target website: <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">{task.targetUrl}</a>
            </p>

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">The following permissions will be requested to record your testing session:</p>
              <div className="flex items-center gap-3 text-sm">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <span>Screen Recording</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <span>Microphone</span>
              </div>
              <p className="text-xs text-muted-foreground">On macOS, you may need to grant Screen Recording and Microphone permissions in System Settings. Chrome may require a restart after granting.</p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">How it works:</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Click &quot;Start Testing&quot; below</li>
                <li>Allow screen recording when prompted</li>
                <li>The target website will open in a new tab</li>
                <li>Complete the test steps in the new tab</li>
                <li>Return here to stop recording when done</li>
              </ol>
            </div>

            {recorder.error === 'permission-denied' && (
              <p className="text-sm text-red-500">Permission denied. Please allow screen recording and microphone access, or skip recording.</p>
            )}
            {recorder.error === 'no-device' && (
              <p className="text-sm text-red-500">No recording device found. Please check your microphone settings.</p>
            )}

            <div className="flex gap-3">
              <Button onClick={handleStartRecording} className="flex-1">
                Start Testing
              </Button>
              <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/submit`)}>
                Skip Recording
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Phase: Recording
  if (phase === 'recording' && task) {
    return (
      <div className="mx-auto max-w-lg py-12 space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-6">
            {/* Recording indicator */}
            <div className="flex items-center justify-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="font-mono text-2xl font-bold">{mm}:{ss}</span>
              <Badge variant="destructive" className="text-xs">REC</Badge>
            </div>

            {/* Time warning */}
            {remainingMin < 2 && (
              <div className="flex items-center justify-center gap-2 text-yellow-500 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>Less than {remainingMin > 0 ? `${remainingMin} min` : '1 min'} remaining. Recording will stop automatically.</span>
              </div>
            )}

            {/* Target website link */}
            <div className="rounded-lg border p-4 text-center space-y-3">
              <Monitor className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">Target website is open in a new tab. Complete the test steps there.</p>
              <a
                href={task.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline"
              >
                <ExternalLink className="h-3 w-3" />
                Open target website
              </a>
            </div>

            {/* Test steps */}
            {task.requirements?.steps && task.requirements.steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Test Steps</p>
                <div className="space-y-1">
                  {task.requirements.steps.map((s: TestStep, i: number) => (
                    <div key={s.id} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{i + 1}.</span> {s.instruction}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stop button */}
            <Button
              variant="destructive"
              onClick={handleStopRecording}
              className="w-full"
              size="lg"
            >
              <Square className="h-4 w-4 mr-2" />
              Stop Recording
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // Phase: Uploading
  if (phase === 'uploading') {
    return (
      <div className="mx-auto max-w-md py-12 space-y-6 text-center">
        <h2 className="text-lg font-bold">Saving recording...</h2>
        <Progress value={recorder.uploadProgress} />
        <p className="text-sm text-muted-foreground">{recorder.uploadProgress}%</p>
        {recorder.error === 'upload-failed' && (
          <div className="space-y-2">
            <p className="text-sm text-red-500">Upload failed. Please try again.</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleUpload}>Retry Upload</Button>
              <Button
                variant="outline"
                aria-label="跳过上传，直接提交反馈"
                onClick={handleSkipUpload}
              >
                Skip Upload
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Phase: Done
  if (phase === 'done') {
    return (
      <div className="mx-auto max-w-md py-12 space-y-4 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        <h2 className="text-lg font-bold">Recording complete!</h2>
        <p className="text-sm text-muted-foreground">Redirecting to feedback form...</p>
        <Button variant="link" onClick={() => router.push(`/tasks/${taskId}/submit`)}>
          如果没有自动跳转，点击这里
        </Button>
      </div>
    )
  }

  return null
}
