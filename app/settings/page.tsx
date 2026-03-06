'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { useTranslation } from '@/lib/i18n'

interface Transaction {
  id: string
  amount: number
  type: string
  taskId: string | null
  createdAt: string
}

export default function SettingsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [credits, setCredits] = useState(0)
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [regenerating, setRegenerating] = useState(false)
  const [copied, setCopied] = useState(false)
  const { t } = useTranslation()

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/credits/history')
        .then(res => res.json())
        .then(data => {
          setCredits(data.credits)
          setApiKey(data.apiKey)
          setTransactions(data.transactions)
        })
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

  const typeLabels: Record<string, string> = {
    SIGNUP_BONUS: t('settings.signupBonus'),
    TASK_REWARD: t('settings.testCompleted'),
    TASK_CREATION: t('settings.taskCreated'),
    TASK_REFUND: t('settings.refund'),
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      <Card>
        <CardHeader><CardTitle>{t('settings.creditsBalance')}</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{t('settings.credits', { count: credits })}</p>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader><CardTitle>{t('settings.creditsHistory')}</CardTitle></CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('settings.noTransactions')}</p>
          ) : (
            <div className="space-y-2">
              {transactions.map(tx => (
                <div key={tx.id} className="flex items-center justify-between border-b border-border py-2 last:border-0">
                  <div>
                    <p className="text-sm font-medium">{typeLabels[tx.type] || tx.type}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(tx.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <Badge variant={tx.amount > 0 ? 'default' : 'destructive'}>
                    {tx.amount > 0 ? '+' : ''}{tx.amount}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
