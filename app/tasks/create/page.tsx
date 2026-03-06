'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from '@/lib/i18n'

interface TestStep {
  id: string
  instruction: string
  type: string
}

export default function CreateTaskPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [error, setError] = useState('')
  const [credits, setCredits] = useState<number>(0)
  const [steps, setSteps] = useState<TestStep[]>([])
  const { t } = useTranslation()

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [focus, setFocus] = useState('')
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | ''>(10)
  const [rewardPerTester, setRewardPerTester] = useState<number | ''>(20)
  const [maxTesters, setMaxTesters] = useState<number | ''>(5)

  const totalCost = (rewardPerTester || 0) * (maxTesters || 0)

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/credits/balance')
        .then(res => res.json())
        .then(data => setCredits(data.credits))
        .catch(() => {})
    }
  }, [session?.user?.id])

  if (status === 'loading') return null
  if (!session) {
    router.push('/login')
    return null
  }

  async function handlePreview() {
    if (!url) return
    setPreviewLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/generate-test-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, focus, estimatedMinutes: estimatedMinutes || 10 }),
      })
      if (!res.ok) throw new Error('Failed to generate plan')
      const plan = await res.json()
      setSteps(plan.steps || [])
    } catch {
      setError(t('createTask.generateFailed'))
    } finally {
      setPreviewLoading(false)
    }
  }

  function updateStep(index: number, instruction: string) {
    setSteps(prev => prev.map((s, i) => i === index ? { ...s, instruction } : s))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/tasks/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          title: title || undefined,
          focus: focus || undefined,
          estimatedMinutes: estimatedMinutes || 10,
          rewardPerTester: rewardPerTester || 20,
          maxTesters: maxTesters || 5,
          requirements: steps.length > 0 ? { steps, nps: true, estimatedMinutes: estimatedMinutes || 10 } : undefined,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || 'Failed to create task')
        setLoading(false)
        return
      }

      const data = await res.json()
      router.push(`/tasks/${data.taskId}`)
    } catch {
      setError(t('common.somethingWrong'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-2xl font-bold">{t('createTask.title')}</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="url">{t('createTask.productUrl')}</Label>
          <Input
            id="url"
            value={url}
            onChange={e => setUrl(e.target.value)}
            placeholder={t('createTask.urlPlaceholder')}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="title">{t('createTask.titleLabel')}</Label>
          <Input
            id="title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder={t('createTask.titlePlaceholder')}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="focus">{t('createTask.focusLabel')}</Label>
          <Textarea
            id="focus"
            value={focus}
            onChange={e => setFocus(e.target.value)}
            placeholder={t('createTask.focusPlaceholder')}
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="minutes">{t('createTask.estMinutes')}</Label>
            <Input
              id="minutes"
              type="number"
              min={1}
              max={120}
              value={estimatedMinutes}
              onChange={e => setEstimatedMinutes(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="reward">{t('createTask.creditsPerTester')}</Label>
            <Input
              id="reward"
              type="number"
              min={1}
              max={1000}
              value={rewardPerTester}
              onChange={e => setRewardPerTester(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testers">{t('createTask.maxTesters')}</Label>
            <Input
              id="testers"
              type="number"
              min={1}
              max={50}
              value={maxTesters}
              onChange={e => setMaxTesters(e.target.value === '' ? '' : Number(e.target.value))}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Button type="button" variant="outline" onClick={handlePreview} disabled={!url || previewLoading}>
            {previewLoading ? t('createTask.generating') : t('createTask.previewPlan')}
          </Button>
          <span className="text-sm text-muted-foreground">{t('createTask.aiGenerate')}</span>
        </div>

        {steps.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t('createTask.testSteps')}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {steps.map((step, i) => (
                <div key={step.id} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{t('createTask.stepN', { n: i + 1 })}</Label>
                  <Input
                    value={step.instruction}
                    onChange={e => updateStep(i, e.target.value)}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <span>{t('createTask.totalCost')} <strong>{totalCost} credits</strong></span>
              <span className="text-sm text-muted-foreground">
                {t('createTask.yourBalance', { count: credits })}
                {credits < totalCost && (
                  <span className="ml-2 text-red-500">{t('createTask.insufficient')}</span>
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={loading || credits < totalCost}>
          {loading ? t('createTask.creating') : t('createTask.launchTest')}
        </Button>
      </form>
    </div>
  )
}
