'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/auth/regenerate-key')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data?.apiKey) setApiKey(data.apiKey) })
        .catch(() => {})
    }
  }, [session?.user?.id])

  if (status === 'loading') return null
  if (!session) { router.push('/login'); return null }

  async function handleRegenerate() {
    if (!confirm(t('settings.regenerateConfirm'))) return
    setRegenerating(true)
    try {
      const res = await fetch('/api/auth/regenerate-key', { method: 'POST' })
      if (res.ok) {
        const data = await res.json()
        setApiKey(data.apiKey)
        setShowKey(true)
      }
    } finally {
      setRegenerating(false)
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(apiKey)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const maskedKey = apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Card>
        <CardHeader><CardTitle>{t('settings.apiKey')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              value={showKey ? apiKey : maskedKey}
              readOnly
              className="font-mono text-sm"
            />
            <Button variant="outline" size="sm" onClick={() => setShowKey(!showKey)}>
              {showKey ? t('settings.hide') : t('settings.show')}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? t('settings.copied') : t('settings.copy')}
            </Button>
          </div>
          <Button variant="destructive" size="sm" onClick={handleRegenerate} disabled={regenerating}>
            {regenerating ? t('settings.regenerating') : t('settings.regenerateKey')}
          </Button>
          <div className="mt-4 rounded bg-muted p-3">
            <p className="mb-2 text-xs text-muted-foreground">{t('settings.exampleUsage')}</p>
            <code className="text-xs break-all">
              curl -X POST {typeof window !== 'undefined' ? window.location.origin : ''}/api/skill/human-test \<br />
              &nbsp;&nbsp;-H &quot;Authorization: Bearer {showKey ? apiKey : '<your-api-key>'}&quot; \<br />
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
              &nbsp;&nbsp;-d &apos;{'{'}&quot;url&quot;:&quot;https://your-product.com&quot;{'}'}&apos;
            </code>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
