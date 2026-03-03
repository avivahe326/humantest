'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useMediaRecorder } from '@/hooks/useMediaRecorder'
import { Monitor, Mic, Square, CheckCircle, AlertTriangle } from 'lucide-react'

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
  const [embeddable, setEmbeddable] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [useFullscreen, setUseFullscreen] = useState(false)
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

  // Load task info + claim validation + probe
  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function load() {
      try {
        // Fetch task info
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

        // Validate claim - only check existing claim, never auto-create
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

        // Probe iframe embeddability
        try {
          const probeRes = await fetch(`/api/tasks/${taskId}/probe`)
          if (probeRes.ok) {
            const probeData = await probeRes.json()
            // Block same-origin iframe to prevent sandbox escape (F12)
            let canEmbed = probeData.embeddable
            if (canEmbed) {
              try {
                const targetHost = new URL(taskData.targetUrl).hostname
                if (targetHost === window.location.hostname) canEmbed = false
              } catch { canEmbed = false }
            }
            if (!cancelled) setEmbeddable(canEmbed)
          }
        } catch {
          // Probe failed, default to fullscreen mode
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

  // Watch recorder status transitions (F9: guard against double upload)
  useEffect(() => {
    if (recorder.status === 'recording' && phase !== 'recording') {
      setPhase('recording')
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
    if (!embeddable || useFullscreen) {
      // Fullscreen mode: open target in new tab
      const win = window.open(task!.targetUrl, '_blank')
      if (!win) {
        // Popup blocked - we'll show manual link
      }
    }
    await recorder.startRecording()
  }, [embeddable, useFullscreen, task, recorder])

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
  }, [recorder])

  const handleUpload = useCallback(async () => {
    if (!claimId) return
    setPhase('uploading')
    try {
      await recorder.uploadRecordings(taskId, claimId)
    } catch {
      // Error handled in hook, phase stays at uploading or reverts
      setPhase('recording')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, claimId])

  const handleDone = useCallback(() => {
    setPhase('done')
    // Store URLs in sessionStorage
    const urls = {
      screenRecUrl: recorder.screenRecUrl,
      audioUrl: recorder.audioUrl,
    }
    try {
      sessionStorage.setItem(`recording-urls-${taskId}`, JSON.stringify(urls))
    } catch {
      // QuotaExceededError: fallback to query params
      const params = new URLSearchParams()
      if (urls.screenRecUrl) params.set('screenRecUrl', urls.screenRecUrl)
      if (urls.audioUrl) params.set('audioUrl', urls.audioUrl)
      setTimeout(() => router.push(`/tasks/${taskId}/submit?${params.toString()}`), 1500)
      return
    }
    setTimeout(() => router.push(`/tasks/${taskId}/submit`), 1500)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, router, recorder.screenRecUrl, recorder.audioUrl])

  const handleSwitchToFullscreen = useCallback(() => {
    setUseFullscreen(true)
    const win = window.open(task!.targetUrl, '_blank')
    if (!win) {
      // Will show manual link in UI
    }
  }, [task])

  const remainingMs = 15 * 60 * 1000 - recorder.duration
  const remainingMin = Math.floor(remainingMs / 60000)
  const durationSec = Math.floor(recorder.duration / 1000)
  const mm = String(Math.floor(durationSec / 60)).padStart(2, '0')
  const ss = String(durationSec % 60).padStart(2, '0')

  if (authStatus === 'loading' || phase === 'loading') {
    return <div className="py-12 text-center">Loading...</div>
  }

  // Error phase
  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-lg py-12 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-500">{errorMsg}</h1>
        <Button onClick={() => router.push(`/tasks/${taskId}`)}>Back to Task</Button>
      </div>
    )
  }

  // Phase: Ready (permission preparation)
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
    const isFullscreen = !embeddable || useFullscreen

    return (
      <div className="flex h-[calc(100vh-4rem)]">
        {/* Left: iframe or fullscreen prompt */}
        <div className="flex-1 relative">
          {!isFullscreen ? (
            <>
              <iframe
                src={task.targetUrl}
                className="w-full h-full border-0"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
              <button
                onClick={handleSwitchToFullscreen}
                className="absolute bottom-3 left-3 text-xs text-muted-foreground underline hover:text-primary bg-background/80 px-2 py-1 rounded"
              >
                Can&apos;t load iframe? Switch to fullscreen mode
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full space-y-4 p-8">
              <Monitor className="h-16 w-16 text-muted-foreground" />
              <p className="text-lg font-medium">Target website opened in a new tab</p>
              <p className="text-sm text-muted-foreground">Please interact with the target website in the new tab. Your screen is being recorded.</p>
              <a
                href={task.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-primary underline"
              >
                Open target website manually
              </a>
            </div>
          )}
        </div>

        {/* Right: sidebar */}
        <div className="w-80 border-l flex flex-col p-4 space-y-4 overflow-y-auto">
          {/* Recording indicator */}
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
            </span>
            <span className="font-mono text-lg font-bold">{mm}:{ss}</span>
            <Badge variant="destructive" className="text-xs">REC</Badge>
          </div>

          {/* Time warning */}
          {remainingMin < 2 && (
            <div className="flex items-center gap-2 text-yellow-500 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>Less than {remainingMin > 0 ? `${remainingMin} min` : '1 min'} remaining. Recording will stop automatically.</span>
            </div>
          )}

          {/* Test steps */}
          {task.requirements?.steps && task.requirements.steps.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Test Steps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {task.requirements.steps.map((s: TestStep, i: number) => (
                  <div key={s.id} className="text-sm">
                    <span className="font-medium">{i + 1}.</span> {s.instruction}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Stop button */}
          <Button
            variant="destructive"
            onClick={handleStopRecording}
            className="w-full mt-auto"
          >
            <Square className="h-4 w-4 mr-2" />
            Stop Recording
          </Button>
        </div>
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
            <Button onClick={handleUpload}>Retry Upload</Button>
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
      </div>
    )
  }

  return null
}
