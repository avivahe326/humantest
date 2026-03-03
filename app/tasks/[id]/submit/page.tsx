'use client'

import { useState, useEffect } from 'react'
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

interface TestStep {
  id: string
  instruction: string
  type: string
}

const STORAGE_KEY_PREFIX = 'human-test-draft-'

export default function SubmitFeedbackPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const params = useParams()
  const taskId = params.id as string

  const [step, setStep] = useState(1)
  const [task, setTask] = useState<{
    title: string
    targetUrl: string
    rewardPerTester: number
    requirements: { steps: TestStep[]; nps: boolean } | null
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState<{ creditsEarned: number; newBalance: number } | null>(null)

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

  // Load recording URLs from sessionStorage (priority) or query params (fallback), then draft from localStorage
  useEffect(() => {
    // 1. Check sessionStorage (coming from recording page)
    const recordingKey = `recording-urls-${taskId}`
    const recording = sessionStorage.getItem(recordingKey)
    let fromRecording = false
    if (recording) {
      try {
        const { screenRecUrl: sUrl, audioUrl: aUrl } = JSON.parse(recording)
        if (sUrl) { setScreenRecUrl(sUrl); fromRecording = true }
        if (aUrl) { setAudioUrl(aUrl); fromRecording = true }
        if (fromRecording) setAutoRecorded(true)
      } catch {
        // Corrupted sessionStorage value, ignore
      }
      sessionStorage.removeItem(recordingKey)
      if (fromRecording) return
    }

    // 1b. Fallback: check URL query params (sessionStorage write failure fallback)
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

    // 2. Otherwise restore from localStorage draft (existing logic)
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
        setError('Failed to load task')
        setLoading(false)
      })
  }, [taskId])

  if (authStatus === 'loading' || loading) return <div className="py-12 text-center">Loading...</div>
  if (!session) { router.push('/login'); return null }
  if (!task) return <div className="py-12 text-center text-red-500">{error || 'Task not found'}</div>

  const testSteps = task.requirements?.steps || []

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
            steps: testSteps.map(s => ({ id: s.id, answer: stepAnswers[s.id] || '' })),
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
      setSuccess({ creditsEarned: data.creditsEarned, newBalance: data.newBalance })
    } catch {
      setError('Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className="mx-auto max-w-lg py-12 text-center space-y-4">
        <h1 className="text-3xl font-bold">Thanks!</h1>
        <p className="text-lg">+{success.creditsEarned} credits earned.</p>
        <p className="text-muted-foreground">Your balance: {success.newBalance} credits</p>
        <div className="flex justify-center gap-4 pt-4">
          <Link href="/tasks"><Button>Test another product</Button></Link>
          <Link href="/my-tasks"><Button variant="outline">View my tasks</Button></Link>
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
          <span>Step {step} of 3</span>
          <span>{Math.round((step / 3) * 100)}%</span>
        </div>
        <Progress value={(step / 3) * 100} />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Step 1: First Impression */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 1: First Impression</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You just opened {task.targetUrl}. What&apos;s your first reaction? (1-3 sentences)
            </p>
            <Textarea
              value={firstImpression}
              onChange={e => setFirstImpression(e.target.value)}
              placeholder="Describe your first impression..."
              rows={4}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep(2)} disabled={!firstImpression.trim()}>
                Next
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Task Experience */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 2: Task Experience</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {testSteps.map((s, i) => (
              <div key={s.id} className="space-y-2">
                <Label className="font-medium">
                  {i + 1}. {s.instruction}
                </Label>
                <Textarea
                  value={stepAnswers[s.id] || ''}
                  onChange={e => updateStepAnswer(s.id, e.target.value)}
                  placeholder="Your answer..."
                  rows={3}
                />
              </div>
            ))}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={() => setStep(3)}>Next</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Summary */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Step 3: Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Would you recommend this product? (1-10)</Label>
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
              <Label>Best part</Label>
              <Textarea value={best} onChange={e => setBest(e.target.value)} placeholder="What did you like most?" rows={3} />
            </div>
            <div className="space-y-2">
              <Label>Worst part / most confusing thing</Label>
              <Textarea value={worst} onChange={e => setWorst(e.target.value)} placeholder="What was confusing or could be improved?" rows={3} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Screen recording URL (optional)</Label>
                {autoRecorded && screenRecUrl && <Badge variant="secondary">已自动录制</Badge>}
              </div>
              <Input value={screenRecUrl} onChange={e => setScreenRecUrl(e.target.value)} placeholder="https://www.loom.com/..." readOnly={autoRecorded && !!screenRecUrl} className={autoRecorded && screenRecUrl ? 'opacity-70' : ''} />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label>Audio feedback URL (optional)</Label>
                {autoRecorded && audioUrl && <Badge variant="secondary">已自动录制</Badge>}
              </div>
              <Input value={audioUrl} onChange={e => setAudioUrl(e.target.value)} placeholder="https://..." readOnly={autoRecorded && !!audioUrl} className={autoRecorded && audioUrl ? 'opacity-70' : ''} />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
              <Button onClick={handleSubmit} disabled={submitting || !best.trim() || !worst.trim()}>
                {submitting ? 'Submitting...' : 'Submit Feedback'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
