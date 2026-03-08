'use client'

import { useState, useEffect, useCallback } from 'react'
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
  const [isAdmin, setIsAdmin] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const { t } = useTranslation()

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(''), 2000)
  }, [])

  useEffect(() => {
    if (session?.user?.id) {
      fetch('/api/auth/regenerate-key')
        .then(res => res.ok ? res.json() : null)
        .then(data => { if (data?.apiKey) setApiKey(data.apiKey) })
        .catch(() => {})

      fetch('/api/settings')
        .then(res => {
          if (res.ok) {
            setIsAdmin(true)
            return res.json()
          }
          return null
        })
        .then(data => { if (data?.settings) setSettings(data.settings) })
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

  function updateSetting(key: string, value: string) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  async function saveSection(sectionKey: string, keys: string[]) {
    setSaving(sectionKey)
    try {
      const body: Record<string, string> = {}
      for (const k of keys) {
        if (settings[k] !== undefined) body[k] = settings[k]
      }
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        showToast(t('settings.saved'))
      }
    } finally {
      setSaving(null)
    }
  }

  const maskedKey = apiKey ? apiKey.slice(0, 8) + '...' + apiKey.slice(-4) : ''

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>

      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded bg-green-600 px-4 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}

      {/* API Key Section (all users) */}
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
              &nbsp;&nbsp;-H &quot;Content-Type: application/json&quot; \<br />
              &nbsp;&nbsp;-d &apos;{'{'}&quot;url&quot;:&quot;https://your-product.com&quot;{'}'}&apos;
            </code>
          </div>
        </CardContent>
      </Card>

      {/* Admin-only sections */}
      {isAdmin && (
        <>
          {/* Platform Settings */}
          <Card>
            <CardHeader><CardTitle>{t('settings.platformSettings')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('settings.aiProvider')}</label>
                <select
                  className="mt-1 block w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  value={settings.AI_PROVIDER || ''}
                  onChange={e => updateSetting('AI_PROVIDER', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="openai">OpenAI / Compatible</option>
                </select>
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.aiApiKey')}</label>
                <Input
                  type="password"
                  value={settings.AI_API_KEY || ''}
                  onChange={e => updateSetting('AI_API_KEY', e.target.value)}
                  placeholder="sk-..."
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.aiBaseUrl')}</label>
                <Input
                  value={settings.AI_BASE_URL || ''}
                  onChange={e => updateSetting('AI_BASE_URL', e.target.value)}
                  placeholder={t('settings.aiBaseUrlPlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.aiModel')}</label>
                <Input
                  value={settings.AI_MODEL || ''}
                  onChange={e => updateSetting('AI_MODEL', e.target.value)}
                  placeholder={t('settings.aiModelPlaceholder')}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.defaultLocale')}</label>
                <select
                  className="mt-1 block w-full rounded border border-input bg-background px-3 py-2 text-sm"
                  value={settings.DEFAULT_LOCALE || ''}
                  onChange={e => updateSetting('DEFAULT_LOCALE', e.target.value)}
                >
                  <option value="">—</option>
                  <option value="en">English</option>
                  <option value="zh">中文</option>
                </select>
              </div>

              <hr className="my-2" />
              <p className="text-sm font-medium text-muted-foreground">{t('settings.smtpSection')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">{t('settings.smtpHost')}</label>
                  <Input value={settings.SMTP_HOST || ''} onChange={e => updateSetting('SMTP_HOST', e.target.value)} placeholder="smtp.example.com" />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('settings.smtpPort')}</label>
                  <Input value={settings.SMTP_PORT || ''} onChange={e => updateSetting('SMTP_PORT', e.target.value)} placeholder="465" />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('settings.smtpUser')}</label>
                  <Input value={settings.SMTP_USER || ''} onChange={e => updateSetting('SMTP_USER', e.target.value)} />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('settings.smtpPass')}</label>
                  <Input type="password" value={settings.SMTP_PASS || ''} onChange={e => updateSetting('SMTP_PASS', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.smtpFrom')}</label>
                <Input value={settings.SMTP_FROM || ''} onChange={e => updateSetting('SMTP_FROM', e.target.value)} placeholder='"human_test()" <noreply@example.com>' />
              </div>

              <hr className="my-2" />
              <p className="text-sm font-medium text-muted-foreground">{t('settings.ossSection')}</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">{t('settings.ossRegion')}</label>
                  <Input value={settings.OSS_REGION || ''} onChange={e => updateSetting('OSS_REGION', e.target.value)} placeholder="oss-ap-southeast-1" />
                </div>
                <div>
                  <label className="text-sm font-medium">{t('settings.ossBucket')}</label>
                  <Input value={settings.OSS_BUCKET || ''} onChange={e => updateSetting('OSS_BUCKET', e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.ossRoleName')}</label>
                <Input value={settings.OSS_ROLE_NAME || ''} onChange={e => updateSetting('OSS_ROLE_NAME', e.target.value)} placeholder="humantest" />
              </div>

              <hr className="my-2" />
              <div>
                <label className="text-sm font-medium">{t('settings.githubToken')}</label>
                <Input type="password" value={settings.GITHUB_TOKEN || ''} onChange={e => updateSetting('GITHUB_TOKEN', e.target.value)} />
              </div>

              <Button
                onClick={() => saveSection('platform', [
                  'AI_PROVIDER', 'AI_API_KEY', 'AI_BASE_URL', 'AI_MODEL', 'DEFAULT_LOCALE',
                  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS', 'SMTP_FROM',
                  'OSS_REGION', 'OSS_BUCKET', 'OSS_ROLE_NAME', 'GITHUB_TOKEN',
                ])}
                disabled={saving === 'platform'}
              >
                {saving === 'platform' ? t('settings.saving') : t('settings.save')}
              </Button>
            </CardContent>
          </Card>

          {/* Default Task Settings */}
          <Card>
            <CardHeader><CardTitle>{t('settings.defaultTaskSettings')}</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium">{t('settings.defaultMaxTesters')}</label>
                <Input
                  type="number"
                  min={1}
                  max={50}
                  value={settings.DEFAULT_MAX_TESTERS || '5'}
                  onChange={e => updateSetting('DEFAULT_MAX_TESTERS', e.target.value)}
                />
              </div>
              <div>
                <label className="text-sm font-medium">{t('settings.defaultEstMinutes')}</label>
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={settings.DEFAULT_ESTIMATED_MINUTES || '10'}
                  onChange={e => updateSetting('DEFAULT_ESTIMATED_MINUTES', e.target.value)}
                />
              </div>
              <Button
                onClick={() => saveSection('defaults', ['DEFAULT_MAX_TESTERS', 'DEFAULT_ESTIMATED_MINUTES'])}
                disabled={saving === 'defaults'}
              >
                {saving === 'defaults' ? t('settings.saving') : t('settings.save')}
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
