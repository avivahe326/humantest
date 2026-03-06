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
import { useTranslation } from '@/lib/i18n'

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

type Phase = 'loading' | 'error' | 'ready' | 'recording' | 'uploading' | 'done' | 'interrupted' | 'recovery' | 'has-recording'

export default function IntegratedTestPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { t } = useTranslation()

  const [phase, setPhase] = useState<Phase>('loading')
  const [task, setTask] = useState<TaskInfo | null>(null)
  const [claimId, setClaimId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const uploadTriggeredRef = useRef(false)

  const recorder = useMediaRecorder({
    maxDurationMs: 15 * 60 * 1000,
  })

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/login')
    }
  }, [authStatus, router])

  useEffect(() => {
    if (!session) return

    let cancelled = false

    async function load() {
      try {
        const wasRecording = sessionStorage.getItem(`recording-active-${taskId}`)
        console.log('[Test] wasRecording flag:', wasRecording)
        if (wasRecording) {
          try {
            const claimRes = await fetch(`/api/tasks/${taskId}/my-claim`)
            if (claimRes.ok) {
              const claimData = await claimRes.json()
              console.log('[Test] Claim data:', claimData)
              if (claimData.screenRecUrl || claimData.audioUrl) {
                console.log('[Test] URLs already exist, redirecting to submit')
                sessionStorage.removeItem(`recording-active-${taskId}`)
                if (!cancelled) router.push(`/tasks/${taskId}/submit`)
                return
              }
            }
          } catch (e) {
            console.error('[Test] Failed to fetch claim:', e)
          }
          console.log('[Test] Showing recovery UI')
          if (!cancelled) {
            try {
              const infoRes = await fetch(`/api/tasks/${taskId}/info`)
              if (infoRes.ok) {
                const taskData = await infoRes.json()
                if (!cancelled) setTask(taskData)
              }
            } catch {}
            setPhase('recovery')
          }
          return
        }

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
          const claimData = await claimRes.json()
          if (!cancelled) setClaimId(claimData.claimId)
          if (claimData.screenRecUrl || claimData.audioUrl) {
            if (!cancelled) setPhase('has-recording')
            return
          }
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
  }, [session, taskId, router])

  useEffect(() => {
    if (phase !== 'recording') return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [phase])

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
    const started = await recorder.startRecording()
    if (started && task?.targetUrl) {
      try { sessionStorage.setItem(`recording-active-${taskId}`, '1') } catch {}
      window.open(task.targetUrl, '_blank')
    }
  }, [recorder, task, taskId])

  const handleStopRecording = useCallback(() => {
    recorder.stopRecording()
  }, [recorder])

  const handleUpload = useCallback(async () => {
    if (!claimId) return
    setPhase('uploading')
    try {
      await recorder.uploadRecordings(taskId, claimId)
    } catch {
      // Error handled in hook
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, claimId])

  const handleDone = useCallback(() => {
    setPhase('done')
    try { sessionStorage.removeItem(`recording-active-${taskId}`) } catch {}
    const urls = {
      screenRecUrl: recorder.screenRecUrl,
      audioUrl: recorder.audioUrl,
    }
    console.log('[Recording] Saving URLs:', urls)
    try {
      sessionStorage.setItem(`recording-urls-${taskId}`, JSON.stringify(urls))
      console.log('[Recording] Saved to sessionStorage')
    } catch (e) {
      console.error('[Recording] Failed to save to sessionStorage:', e)
    }
    try {
      localStorage.setItem(`recording-urls-${taskId}`, JSON.stringify(urls))
      console.log('[Recording] Saved to localStorage')
    } catch (e) {
      console.error('[Recording] Failed to save to localStorage:', e)
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
    if (window.confirm(t('test.skipUploadConfirm'))) {
      try { sessionStorage.removeItem(`recording-active-${taskId}`) } catch {}
      router.push(`/tasks/${taskId}/submit`)
    }
  }, [router, taskId, t])

  const remainingMs = 15 * 60 * 1000 - recorder.duration
  const remainingMin = Math.floor(remainingMs / 60000)
  const durationSec = Math.floor(recorder.duration / 1000)
  const mm = String(Math.floor(durationSec / 60)).padStart(2, '0')
  const ss = String(durationSec % 60).padStart(2, '0')

  if (authStatus === 'loading' || phase === 'loading') {
    return <div className="py-12 text-center">{t('test.loading')}</div>
  }

  if (phase === 'error') {
    return (
      <div className="mx-auto max-w-lg py-12 text-center space-y-4">
        <h1 className="text-xl font-bold text-red-500">{errorMsg}</h1>
        <Button onClick={() => router.push(`/tasks/${taskId}`)}>{t('test.backToTask')}</Button>
      </div>
    )
  }

  // Phase: Has existing recording
  if (phase === 'has-recording' && task) {
    const handleUseExisting = () => {
      router.push(`/tasks/${taskId}/submit`)
    }

    const handleReRecord = async () => {
      try {
        await fetch(`/api/tasks/${taskId}/my-claim`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screenRecUrl: '', audioUrl: '' }),
        })
      } catch {}
      setPhase('ready')
    }

    return (
      <div className="mx-auto max-w-md py-12 space-y-6 text-center">
        <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
        <h2 className="text-lg font-bold">{t('test.hasRecording')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('test.hasRecordingDesc')}
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleUseExisting}>
            {t('test.useExisting')}
          </Button>
          <Button variant="outline" onClick={handleReRecord}>
            {t('test.recordNew')}
          </Button>
        </div>
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
              {t('test.targetWebsite')} <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="underline text-primary">{task.targetUrl}</a>
            </p>

            <div className="rounded-lg border p-4 space-y-3">
              <p className="text-sm font-medium">{t('test.permissionsIntro')}</p>
              <div className="flex items-center gap-3 text-sm">
                <Monitor className="h-5 w-5 text-muted-foreground" />
                <span>{t('test.screenRecording')}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Mic className="h-5 w-5 text-muted-foreground" />
                <span>{t('test.microphone')}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('test.macPermissions')}</p>
            </div>

            <div className="rounded-lg bg-muted/50 p-4 space-y-2">
              <p className="text-sm font-medium">{t('test.howItWorks')}</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>{t('test.howStep1')}</li>
                <li>{t('test.howStep2')}</li>
                <li>{t('test.howStep3')}</li>
                <li>{t('test.howStep4')}</li>
                <li>{t('test.howStep5')}</li>
              </ol>
            </div>

            {recorder.error === 'permission-denied' && (
              <p className="text-sm text-red-500">{t('test.permissionDenied')}</p>
            )}
            {recorder.error === 'no-device' && (
              <p className="text-sm text-red-500">{t('test.noDevice')}</p>
            )}

            <div className="flex gap-3">
              <Button onClick={handleStartRecording} className="flex-1">
                {t('test.startTesting')}
              </Button>
              <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/submit`)}>
                {t('test.skipRecording')}
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
            <div className="flex items-center justify-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="font-mono text-2xl font-bold">{mm}:{ss}</span>
              <Badge variant="destructive" className="text-xs">{t('test.rec')}</Badge>
            </div>

            {remainingMin < 2 && (
              <div className="flex items-center justify-center gap-2 text-yellow-500 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span>{t('test.timeWarning', { min: remainingMin > 0 ? `${remainingMin} min` : '1 min' })}</span>
              </div>
            )}

            <div className="rounded-lg border p-4 text-center space-y-3">
              <Monitor className="h-10 w-10 text-muted-foreground mx-auto" />
              <p className="text-sm text-muted-foreground">{t('test.targetOpen')}</p>
              <a
                href={task.targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary underline"
              >
                <ExternalLink className="h-3 w-3" />
                {t('test.openTarget')}
              </a>
            </div>

            {task.requirements?.steps && task.requirements.steps.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('test.testSteps')}</p>
                <div className="space-y-1">
                  {task.requirements.steps.map((s: TestStep, i: number) => (
                    <div key={s.id} className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{i + 1}.</span> {s.instruction}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button
              variant="destructive"
              onClick={handleStopRecording}
              className="w-full"
              size="lg"
            >
              <Square className="h-4 w-4 mr-2" />
              {t('test.stopRecording')}
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
        <h2 className="text-lg font-bold">{t('test.savingRecording')}</h2>
        <Progress value={recorder.uploadProgress} />
        <p className="text-sm text-muted-foreground">{recorder.uploadProgress}%</p>
        {recorder.error === 'upload-failed' && (
          <div className="space-y-2">
            <p className="text-sm text-red-500">{t('test.uploadFailed')}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleUpload}>{t('test.retryUpload')}</Button>
              <Button
                variant="outline"
                onClick={handleSkipUpload}
              >
                {t('test.skipUpload')}
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
        <h2 className="text-lg font-bold">{t('test.recordingComplete')}</h2>
        <p className="text-sm text-muted-foreground">{t('test.redirecting')}</p>
        <Button variant="link" onClick={() => router.push(`/tasks/${taskId}/submit`)}>
          {t('test.clickHereRedirect')}
        </Button>
      </div>
    )
  }

  // Phase: Recovery
  if (phase === 'recovery') {
    const handleContinueTesting = () => {
      if (task?.targetUrl) {
        window.open(task.targetUrl, '_blank')
      }
    }

    const handleStopAndUpload = async () => {
      sessionStorage.removeItem(`recording-active-${taskId}`)
      setPhase('uploading')
      try {
        const claimRes = await fetch(`/api/tasks/${taskId}/my-claim`)
        if (!claimRes.ok) throw new Error('No claim')
        const { claimId } = await claimRes.json()
        const recovered = await recorder.recoverAndUpload(taskId, claimId)
        if (recovered) {
          router.push(`/tasks/${taskId}/submit`)
        } else {
          setPhase('interrupted')
        }
      } catch {
        setPhase('interrupted')
      }
    }

    const handleSkipRecording = () => {
      sessionStorage.removeItem(`recording-active-${taskId}`)
      router.push(`/tasks/${taskId}/submit`)
    }

    return (
      <div className="mx-auto max-w-md py-12 space-y-6 text-center">
        <Monitor className="h-12 w-12 text-primary mx-auto" />
        <h2 className="text-lg font-bold">{t('test.recordingInProgress')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('test.activeSession')}
        </p>
        <div className="flex flex-col gap-3">
          <Button onClick={handleContinueTesting}>
            {t('test.continueTesting')}
          </Button>
          <Button variant="secondary" onClick={handleStopAndUpload}>
            {t('test.stopAndSubmit')}
          </Button>
          <Button variant="outline" onClick={handleSkipRecording}>
            {t('test.discardAndSubmit')}
          </Button>
        </div>
      </div>
    )
  }

  // Phase: Interrupted
  if (phase === 'interrupted') {
    return (
      <div className="mx-auto max-w-md py-12 space-y-6 text-center">
        <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
        <h2 className="text-lg font-bold">{t('test.recordingInterrupted')}</h2>
        <p className="text-sm text-muted-foreground">
          {t('test.interruptedDesc')}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={() => setPhase('ready')}>
            {t('test.reRecord')}
          </Button>
          <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}/submit`)}>
            {t('test.submitWithout')}
          </Button>
        </div>
      </div>
    )
  }

  return null
}
