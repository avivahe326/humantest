'use client'

import { useState, useEffect, useRef } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Slider } from '@/components/ui/slider'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'

interface TestStep {
  id: string
  instruction: string
  type: string
}

const STORAGE_KEY_PREFIX = 'human-test-draft-'

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

export default function SubmitFeedbackPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string
  const { t } = useTranslation()

  const [step, setStep] = useState(1)
  const [task, setTask] = useState<{
    title: string
    targetUrl: string
    requirements: { steps: TestStep[]; nps: boolean } | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  // Form state
  const [firstImpression, setFirstImpression] = useState('')
  const [stepAnswers, setStepAnswers] = useState<Record<string, string>>({})
  const [nps, setNps] = useState(5)
  const [best, setBest] = useState('')
  const [worst, setWorst] = useState('')
  const [screenRecUrl, setScreenRecUrl] = useState('')
  const [audioUrl, setAudioUrl] = useState('')
  const [autoRecorded, setAutoRecorded] = useState(false)

  const storageKey = STORAGE_KEY_PREFIX + taskId

  // Load recording URLs from sessionStorage (priority), localStorage, query params, claim API, then draft
  useEffect(() => {
    const recordingKey = `recording-urls-${taskId}`
    let fromRecording = false

    const tryLoadRecordingUrls = (storage: Storage) => {
      const data = storage.getItem(recordingKey)
      if (!data) return false
      try {
        const { screenRecUrl: sUrl, audioUrl: aUrl } = JSON.parse(data)
        let found = false
        if (sUrl) { setScreenRecUrl(sUrl); found = true }
        if (aUrl) { setAudioUrl(aUrl); found = true }
        if (found) setAutoRecorded(true)
        return found
      } catch { return false }
    }

    fromRecording = tryLoadRecordingUrls(sessionStorage) || tryLoadRecordingUrls(localStorage)
    if (fromRecording) {
      try { sessionStorage.removeItem(recordingKey) } catch {}
      try { localStorage.removeItem(recordingKey) } catch {}
      return
    }

    const urlParams = new URLSearchParams(window.location.search)
    const qScreen = urlParams.get('screenRecUrl')
    const qAudio = urlParams.get('audioUrl')
    if (qScreen || qAudio) {
      if (qScreen) setScreenRecUrl(qScreen)
      if (qAudio) setAudioUrl(qAudio)
      setAutoRecorded(true)
      window.history.replaceState({}, '', window.location.pathname)
      return
    }

    fetch(`/api/tasks/${taskId}/my-claim`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (data?.screenRecUrl || data?.audioUrl) {
          if (data.screenRecUrl) setScreenRecUrl(data.screenRecUrl)
          if (data.audioUrl) setAudioUrl(data.audioUrl)
          setAutoRecorded(true)
          return
        }
        try {
          const draft = localStorage.getItem(storageKey)
          if (draft) {
            const parsed = JSON.parse(draft)
            if (parsed.firstImpression) setFirstImpression(parsed.firstImpression)
            if (parsed.stepAnswers) setStepAnswers(parsed.stepAnswers)
            if (parsed.nps) setNps(parsed.nps)
            if (parsed.best) setBest(parsed.best)
            if (parsed.worst) setWorst(parsed.worst)
            if (parsed.screenRecUrl) setScreenRecUrl(parsed.screenRecUrl)
            if (parsed.audioUrl) setAudioUrl(parsed.audioUrl)
          }
        } catch {}
      })
      .catch(() => {
        try {
          const draft = localStorage.getItem(storageKey)
          if (draft) {
            const parsed = JSON.parse(draft)
            if (parsed.firstImpression) setFirstImpression(parsed.firstImpression)
            if (parsed.stepAnswers) setStepAnswers(parsed.stepAnswers)
            if (parsed.nps) setNps(parsed.nps)
            if (parsed.best) setBest(parsed.best)
            if (parsed.worst) setWorst(parsed.worst)
            if (parsed.screenRecUrl) setScreenRecUrl(parsed.screenRecUrl)
            if (parsed.audioUrl) setAudioUrl(parsed.audioUrl)
          }
        } catch {}
      })
  }, [storageKey, taskId])

  // Save draft to localStorage
  useEffect(() => {
    if (!success) {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ firstImpression, stepAnswers, nps, best, worst, screenRecUrl, audioUrl }))
      } catch {}
    }
  }, [firstImpression, stepAnswers, nps, best, worst, screenRecUrl, audioUrl, success, storageKey])

  // Fetch task info
  useEffect(() => {
    fetch(`/api/tasks/${taskId}/info`)
      .then(res => res.json())
      .then(data => {
        setTask(data)
        setLoading(false)
      })
      .catch(() => {
        setError(t('submit.failedToLoad'))
        setLoading(false)
      })
  }, [taskId, t])

  if (authStatus === 'loading' || loading) return <div className="py-12 text-center">{t('submit.loading')}</div>
  if (!session) { router.push('/login'); return null }
  if (!task) return <div className="py-12 text-center text-red-500">{error || t('submit.taskNotFound')}</div>

  const dynamicSteps = task.requirements?.steps ?? []
  const totalSteps = 1 + dynamicSteps.length + 1

  function updateStepAnswer(stepId: string, answer: string) {
    setStepAnswers(prev => ({ ...prev, [stepId]: answer }))
  }

  async function handleSubmit() {
    setSubmitting(true)
    setError('')

    try {
      const res = await fetch(`/api/tasks/${taskId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawData: {
            firstImpression,
            steps: dynamicSteps.map(s => ({
              id: s.id,
              instruction: s.instruction,
              answer: stepAnswers[s.id] || '',
            })),
            nps,
            best,
            worst,
          },
          screenRecUrl: screenRecUrl || undefined,
          audioUrl: audioUrl || undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to submit')
        setSubmitting(false)
        return
      }

      const data = await res.json()
      localStorage.removeItem(storageKey)
      setSuccess(true)
    } catch {
      setError(t('common.somethingWrong'))
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center space-y-4">
        <h1 className="text-3xl font-bold">{t('submit.thanks')}</h1>
        <div className="flex justify-center gap-4 pt-4">
          <Link href="/tasks"><Button>{t('submit.testAnother')}</Button></Link>
          <Link href="/my-tasks"><Button variant="outline">{t('submit.viewMyTasks')}</Button></Link>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold">{task.title}</h1>
        <a href={task.targetUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline">
          {task.targetUrl}
        </a>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{t('submit.stepOf', { step, total: totalSteps })}</span>
          <span>{Math.round((step / totalSteps) * 100)}%</span>
        </div>
        <Progress value={(step / totalSteps) * 100} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Step 1: First Impression */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('submit.firstImpressionTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('submit.firstImpressionPrompt', { url: task.targetUrl })}
            </p>
            <Textarea
              value={firstImpression}
              onChange={e => setFirstImpression(e.target.value)}
              placeholder={t('submit.firstImpressionPlaceholder')}
              rows={4}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!firstImpression.trim()}>
                {t('submit.next')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dynamic steps from test plan */}
      {dynamicSteps.map((s, i) => {
        const stepNum = i + 2
        return step === stepNum ? (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle>{t('submit.taskStepTitle', { step: stepNum, task: i + 1, total: dynamicSteps.length })}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">{s.instruction}</p>
              <Textarea
                value={stepAnswers[s.id] || ''}
                onChange={e => updateStepAnswer(s.id, e.target.value)}
                placeholder={t('submit.describeExperience')}
                rows={4}
              />
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(stepNum - 1)}>{t('submit.back')}</Button>
                <Button onClick={() => setStep(stepNum + 1)} disabled={!(stepAnswers[s.id] || '').trim()}>
                  {t('submit.next')}
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null
      })}

      {/* Final Step: Summary */}
      {step === totalSteps && (
        <Card>
          <CardHeader>
            <CardTitle>{t('submit.summaryTitle', { step: totalSteps })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>{t('submit.recommendQuestion')}</Label>
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">1</span>
                <Slider
                  value={[nps]}
                  onValueChange={v => setNps(v[0])}
                  min={1}
                  max={10}
                  step={1}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground">10</span>
                <span className="w-8 text-center font-bold">{nps}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('submit.bestPart')}</Label>
              <Textarea value={best} onChange={e => setBest(e.target.value)} placeholder={t('submit.bestPlaceholder')} rows={3} />
            </div>
            <div className="space-y-2">
              <Label>{t('submit.worstPart')}</Label>
              <Textarea value={worst} onChange={e => setWorst(e.target.value)} placeholder={t('submit.worstPlaceholder')} rows={3} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>{t('submit.screenRecLabel')}</Label>
                {autoRecorded && screenRecUrl && <Badge variant="secondary">{t('submit.autoRecorded')}</Badge>}
              </div>
              <Input value={screenRecUrl} onChange={e => setScreenRecUrl(e.target.value)} placeholder="https://www.loom.com/..." readOnly={autoRecorded && !!screenRecUrl} className={autoRecorded && screenRecUrl ? 'opacity-70' : ''} />
              {screenRecUrl && (
                <FixedVideo src={screenRecUrl} className="w-full rounded-lg border mt-2" />
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>{t('submit.audioLabel')}</Label>
                {autoRecorded && audioUrl && <Badge variant="secondary">{t('submit.autoRecorded')}</Badge>}
              </div>
              <Input value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="https://..." readOnly={autoRecorded && !!audioUrl} className={autoRecorded && audioUrl ? 'opacity-70' : ''} />
              {audioUrl && (
                <audio controls preload="metadata" className="w-full mt-2" src={audioUrl} />
              )}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(totalSteps - 1)}>{t('submit.back')}</Button>
              <Button onClick={handleSubmit} disabled={submitting || !best.trim() || !worst.trim()}>
                {submitting ? t('submit.submitting') : t('submit.submitFeedback')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
